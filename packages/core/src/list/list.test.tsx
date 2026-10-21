// @vitest-environment happy-dom
/**
 * useResourceTable 四模式行为（内存态）+ createListSearchSchema + useSavedViews。
 * syncWithLocation:false 走内存态便于单测；URL 事实源行为经真路由（createMemoryHistory）验证。
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, render, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { createResource, type ListParams, type ResourceClient } from "../data";
import type { FilterDef, FilterTree } from "../filters";
import {
  createListColumnHelper,
  createListSearchSchema,
  formatSortParam,
  type UseResourceTableOptions,
  useResourceTable,
  useSavedViews,
} from "./index";

// ---------------------------------------------------------------------------
// 内存资源（120 行服务）
// ---------------------------------------------------------------------------

interface Row {
  id: string;
  name: string;
  env: "rep" | "staging" | "prod";
  status: "running" | "degraded" | "stopped";
  replicas: number;
  createdAt: string;
}

function seedRows(): Row[] {
  const envs = ["rep", "staging", "prod"] as const;
  const statuses = ["running", "degraded", "stopped"] as const;
  const at = <T,>(arr: readonly T[], i: number): T => arr[i] as T;
  return Array.from({ length: 120 }, (_, i) => ({
    id: `svc-${String(i + 1).padStart(3, "0")}`,
    name: `service-${String(i + 1).padStart(3, "0")}`,
    env: at(envs, i % 3),
    status: at(statuses, i % 5 === 0 ? 2 : i % 3),
    replicas: (i % 13) + 1,
    createdAt: new Date(2024, 0, 1 + (i % 28), 12, i % 60).toISOString(),
  }));
}

function evaluate(rows: Row[], tree: FilterTree | undefined): Row[] {
  if (!tree) return rows;
  const evalNode = (row: Row, node: FilterTree): boolean => {
    if ("children" in node) {
      return node.combinator === "or"
        ? node.children.some((c) => evalNode(row, c))
        : node.children.every((c) => evalNode(row, c));
    }
    const actual = (row as unknown as Record<string, unknown>)[node.field];
    if (node.op === "eq") return actual === node.value;
    if (node.op === "in")
      return Array.isArray(node.value) && (node.value as unknown[]).includes(actual);
    if (node.op === "contains")
      return String(actual).toLowerCase().includes(String(node.value).toLowerCase());
    return true;
  };
  return rows.filter((row) => evalNode(row, tree));
}

interface Harness {
  listCalls: ListParams[];
  rows: Row[];
}

function makeHarness(initialRows: Row[] = seedRows()): Harness {
  const harness: Harness = { listCalls: [], rows: initialRows };
  return harness;
}

function makeResource(harness: Harness) {
  const client: ResourceClient<Row, Partial<Row>, Partial<Row>> = {
    list: async (params) => {
      harness.listCalls.push(params);
      let rows = evaluate(harness.rows, params.filters);
      const search = params.search;
      if (search) {
        rows = rows.filter((r) => r.name.includes(search));
      }
      const sortSpecs = params.sort;
      if (sortSpecs) {
        rows = [...rows].sort((a, b) => {
          for (const s of sortSpecs) {
            const av = (a as unknown as Record<string, unknown>)[s.field];
            const bv = (b as unknown as Record<string, unknown>)[s.field];
            const cmp =
              typeof av === "number" && typeof bv === "number"
                ? av - bv
                : String(av).localeCompare(String(bv));
            if (cmp !== 0) return s.direction === "asc" ? cmp : -cmp;
          }
          return 0;
        });
      }
      const page = params.page ?? 1;
      let start = (page - 1) * params.pageSize;
      if (params.cursor !== undefined) {
        const lastId = atob(params.cursor).split("|")[1];
        const idx = rows.findIndex((r) => r.id === lastId);
        start = idx >= 0 ? idx + 1 : 0;
      }
      const slice = rows.slice(start, start + params.pageSize);
      const hasMore = start + params.pageSize < rows.length;
      if (params.cursor !== undefined) {
        return {
          rows: slice,
          nextCursor: hasMore
            ? btoa(`${slice[slice.length - 1]?.createdAt}|${slice[slice.length - 1]?.id}`)
            : undefined,
        };
      }
      return {
        rows: slice,
        total: rows.length,
        nextCursor: hasMore
          ? btoa(`${slice[slice.length - 1]?.createdAt}|${slice[slice.length - 1]?.id}`)
          : undefined,
        facets: params.facets
          ? params.facets.map((field) => ({
              field,
              buckets: Object.entries(
                rows.reduce<Record<string, number>>((acc, r) => {
                  const v = String((r as unknown as Record<string, unknown>)[field]);
                  acc[v] = (acc[v] ?? 0) + 1;
                  return acc;
                }, {}),
              ).map(([value, count]) => ({ value, count })),
            }))
          : undefined,
      };
    },
    get: async (id) => harness.rows.find((r) => r.id === id) as Row,
  };
  return createResource<Row, Partial<Row>, Partial<Row>>({
    name: "services",
    client,
    tenantScoped: false,
  });
}

const helper = createListColumnHelper<Row>();
const columns = [
  helper.accessor("name", { header: "Name" }),
  helper.accessor("env", { header: "Env" }),
  helper.accessor("status", { header: "Status" }),
  helper.accessor("replicas", { header: "Replicas" }),
];

const defs: FilterDef[] = [
  { field: "env", label: "环境", kind: "select", options: [] },
  { field: "status", label: "状态", kind: "multi-select", options: [] },
];

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return {
    queryClient,
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

type TableResult = ReturnType<typeof useResourceTable<Row>>;

function renderTable(options: Partial<UseResourceTableOptions<Row>>, harness: Harness) {
  const resource = makeResource(harness);
  const { wrapper } = makeWrapper();
  const rtl = renderHook(
    () =>
      useResourceTable<Row>({
        resource,
        mode: "server-offset",
        columns,
        filters: defs,
        syncWithLocation: false,
        queryOptions: { staleTime: 60_000 },
        ...options,
      } as UseResourceTableOptions<Row>),
    { wrapper },
  );
  return rtl as unknown as {
    result: { current: TableResult };
    rerender: (props?: unknown) => void;
    unmount: () => void;
  };
}

describe("useResourceTable", () => {
  it("server-offset：参数含 page/pageSize/sort/filters/search；翻页 keepPreviousData；过滤变化回第 1 页", async () => {
    const harness = makeHarness();
    const { result } = renderTable({ mode: "server-offset" }, harness);
    await waitFor(() => expect(result.current.query.data?.rows.length).toBe(20));
    expect(result.current.state.page).toBe(1);
    const last = harness.listCalls[harness.listCalls.length - 1];
    expect(last?.page).toBe(1);
    expect(last?.pageSize).toBe(20);

    await act(async () => result.current.setPage(3));
    await waitFor(() => expect(harness.listCalls.at(-1)?.page).toBe(3));
    expect(result.current.state.page).toBe(3);
    expect(result.current.totalRows).toBe(120);
    // 过滤变化回第 1 页
    await act(async () => result.current.applyFilters({ field: "env", op: "eq", value: "prod" }));
    await waitFor(() => expect(harness.listCalls.at(-1)?.filters).toBeDefined());
    expect(result.current.state.page).toBe(1);
    expect(evaluate(harness.rows, harness.listCalls.at(-1)?.filters).length).toBe(
      result.current.totalRows,
    );
    // 排序变化回第 1 页且 sort 进参数
    await act(async () => result.current.setSort([{ field: "name", direction: "desc" }]));
    await waitFor(() =>
      expect(harness.listCalls.at(-1)?.sort).toEqual([{ field: "name", direction: "desc" }]),
    );
    expect(harness.listCalls.at(-1)?.page).toBe(1);
    expect(result.current.state.page).toBe(1);
  });

  it("client 模式：整取 + 客户端过滤/排序/切片；页码越界钳制", async () => {
    const harness = makeHarness();
    const { result } = renderTable({ mode: "client", search: { fields: ["name"] } }, harness);
    await waitFor(() => expect(result.current.clientRows?.length).toBe(120));
    expect(harness.listCalls[0]?.pageSize).toBe(500);
    expect(result.current.clientRows?.length).toBe(120);
    expect(result.current.totalRows).toBe(120);
    expect(result.current.table.getRowModel().rows.length).toBe(20);

    // 搜索过滤（防抖 250ms）
    await act(async () => result.current.setSearch("service-01"));
    await waitFor(() => expect(result.current.state.search).toBe("service-01"), { timeout: 2000 });
    await waitFor(() => {
      expect(result.current.totalRows ?? 0).toBeLessThan(120);
    });

    // 排序（表内排序生效：清空搜索后 name desc 第一行 = service-120）
    await act(async () => result.current.setSearch(""));
    await waitFor(() => expect(result.current.totalRows).toBe(120), { timeout: 2000 });
    await act(async () => result.current.setSort([{ field: "name", direction: "desc" }]));
    await waitFor(() => {
      expect(result.current.table.getRowModel().rows[0]?.original.name).toBe("service-120");
    });

    // 页码钳制：过滤后只剩少量行，跳到大页后自动钳回
    await act(async () => result.current.setPage(50));
    await waitFor(
      () =>
        expect(result.current.state.page).toBeLessThanOrEqual(
          Math.ceil((result.current.totalRows ?? 0) / 20),
        ),
      { timeout: 2000 },
    );
  });

  it("server-cursor：token 栈前进/后退（后退缓存命中无重复请求）", async () => {
    const harness = makeHarness();
    const { result } = renderTable(
      { mode: "server-cursor", pagination: { initialPageSize: 10 } },
      harness,
    );
    await waitFor(() => expect(result.current.query.data?.rows.length).toBe(10));
    await waitFor(() => expect(result.current.cursorStack.length).toBe(1)); // page1 → nextCursor 入栈

    await act(async () => result.current.setPage(2));
    await waitFor(() => expect(result.current.query.data?.rows[0]?.id).toBe("svc-011"));
    expect(result.current.cursorStack.length).toBe(2);

    await act(async () => result.current.setPage(3));
    await waitFor(() => expect(result.current.query.data?.rows[0]?.id).toBe("svc-021"));

    const listCallCount = harness.listCalls.length;
    // 后退到第 2 页：token 仍在栈中 → 缓存命中，无新请求
    await act(async () => result.current.setPage(2));
    await waitFor(() => expect(result.current.query.data?.rows[0]?.id).toBe("svc-011"));
    expect(harness.listCalls.length).toBe(listCallCount);
    // 前进到第 3 页：同样缓存命中
    await act(async () => result.current.setPage(3));
    await waitFor(() => expect(result.current.query.data?.rows[0]?.id).toBe("svc-021"));
    expect(harness.listCalls.length).toBe(listCallCount);
  });

  it("load-more：累计拼接，page 为已加载页数", async () => {
    const harness = makeHarness();
    const { result } = renderTable(
      { mode: "load-more", pagination: { initialPageSize: 10 } },
      harness,
    );
    await waitFor(() => expect(result.current.table.getRowModel().rows.length).toBe(10));
    await act(async () => result.current.loadMore());
    await waitFor(() => expect(result.current.table.getRowModel().rows.length).toBe(20));
    await act(async () => result.current.loadMore());
    await waitFor(() => expect(result.current.table.getRowModel().rows.length).toBe(30));
    expect(result.current.state.page).toBe(3);
    expect(result.current.totalRows).toBe(30);
    // 过滤变化 → 清空累计并回第 1 页
    await act(async () => result.current.applyFilters({ field: "env", op: "eq", value: "rep" }));
    await waitFor(() => expect(result.current.state.page).toBe(1), { timeout: 2000 });
    await waitFor(
      () => {
        const rows = result.current.table.getRowModel().rows.map((r) => r.original);
        expect(rows.length).toBe(10); // 回到单页累计
        expect(rows.every((r) => r.env === "rep")).toBe(true);
      },
      { timeout: 2000 },
    );
  });

  it("permanentFilters 合并进请求且不进 URL/内存树", async () => {
    const harness = makeHarness();
    const { result } = renderTable(
      { mode: "server-offset", permanentFilters: { field: "env", op: "eq", value: "prod" } },
      harness,
    );
    await waitFor(() => expect(result.current.query.data).toBeDefined());
    expect(harness.listCalls[0]?.filters).toEqual({
      field: "env",
      op: "eq",
      value: "prod",
    });
    expect(result.current.state.filters).toBeUndefined();
  });

  it("facets 请求与返回", async () => {
    const harness = makeHarness();
    const { result } = renderTable({ mode: "server-offset", facets: ["env"] }, harness);
    await waitFor(() => expect(result.current.facetData).toBeDefined());
    expect(harness.listCalls[0]?.facets).toEqual(["env"]);
    expect(result.current.facetData?.[0]?.buckets.length).toBeGreaterThan(0);
  });

  it("URL 事实源：状态写入 search params（真路由）", async () => {
    const harness = makeHarness();
    const resource = makeResource(harness);
    const { queryClient } = makeWrapper();
    const schema = createListSearchSchema({ filters: defs });

    let latest: TableResult | undefined;
    // biome-ignore lint/correctness/noComponentHookFactories: 测试内组装 probe hook（由下方 Probe 组件消费）
    function useProbeTable(): TableResult {
      const table = useResourceTable<Row>({
        resource,
        mode: "server-offset",
        columns,
        filters: defs,
        pagination: { pageSizeOptions: [10, 20, 50] },
      });
      latest = table as TableResult;
      return table;
    }
    // biome-ignore lint/correctness/noComponentHookFactories: 路由组件必须内联定义以闭包捕获 latest
    function Probe() {
      useProbeTable();
      return null;
    }

    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const listRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/services",
      validateSearch: schema,
      component: Probe,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([listRoute]),
      history: createMemoryHistory({ initialEntries: ["/services"] }),
    });

    await act(async () => {
      await router.load();
    });

    const { container } = render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    expect(container).toBeDefined();

    await waitFor(() => expect(latest?.query.data).toBeDefined(), { timeout: 3000 });

    await act(async () => latest?.applyFilters({ field: "status", op: "in", value: ["running"] }));
    await act(async () => latest?.setSort([{ field: "name", direction: "desc" }]));
    await act(async () => latest?.setSearch("gateway"));
    // 搜索防抖 250ms 后进 URL（期间页码会被搜索提交重置，故先等提交完成再翻页）
    await waitFor(
      () => {
        expect((router.state.location.search as Record<string, unknown>).q).toBe("gateway");
      },
      { timeout: 2000 },
    );
    await act(async () => latest?.setPage(2));
    await waitFor(
      () => {
        const search = router.state.location.search as Record<string, unknown>;
        expect(search.status).toBe("running");
        expect(search.sort).toBe("name:desc");
        expect(search.page).toBe(2);
      },
      { timeout: 3000 },
    );
    // URL → 状态还原（过滤器/排序/页码一致）
    expect(latest?.state.filters).toEqual({ field: "status", op: "in", value: ["running"] });
    expect(formatSortParam(latest?.state.sort ?? [])).toBe("name:desc");
    expect(latest?.state.page).toBe(2);
    expect(latest?.state.search).toBe("gateway");
  });
});

describe("createListSearchSchema", () => {
  const schema = createListSearchSchema({ filters: defs });

  it("合法值解析", () => {
    const parsed = schema.parse({
      q: "x",
      status: "running,stopped",
      sort: "a:asc",
      page: 3,
      size: 50,
    });
    expect(parsed).toMatchObject({
      q: "x",
      status: "running,stopped",
      sort: "a:asc",
      page: 3,
      size: 50,
    });
  });

  it("坏值兜底不中断", () => {
    expect(schema.parse({ page: "abc", size: 33, sort: 123 })).toMatchObject({
      page: undefined,
      size: undefined,
      sort: undefined,
    });
    expect(schema.parse({ q: 42 })).toMatchObject({ q: undefined }); // 非 string 直接落 catch 兜底
    expect(schema.parse({ env: {} })).toMatchObject({ env: undefined });
  });
});

describe("useSavedViews", () => {
  it("保存/应用/重命名/删除 + 去重", async () => {
    const store = new Map<string, string>();
    const localStorageMock: Storage = {
      getItem: (k) => store.get(k) ?? null,
      setItem: (k, v) => void store.set(k, v),
      removeItem: (k) => void store.delete(k),
      clear: () => store.clear(),
      key: () => null,
      get length() {
        return store.size;
      },
    };
    vi.stubGlobal("localStorage", localStorageMock);

    let views: ReturnType<typeof useSavedViews> | undefined;
    // biome-ignore lint/correctness/noComponentHookFactories: 测试专用 probe 组件
    function Probe() {
      views = useSavedViews("services");
      return null;
    }
    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const listRoute = createRoute({
      getParentRoute: () => rootRoute,
      path: "/services",
      validateSearch: createListSearchSchema({}),
      component: Probe,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([listRoute]),
      history: createMemoryHistory({ initialEntries: ["/services?status=running&page=2"] }),
    });

    render(
      <QueryClientProvider client={new QueryClient()}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    const api = () => views as ReturnType<typeof useSavedViews>;
    await waitFor(() => expect(api()).toBeDefined());

    let saved: ReturnType<typeof useSavedViews>["views"][number] | undefined;
    act(() => {
      saved = api().save("生产视图");
    });
    expect(saved?.search).toContain("status=running");
    expect(api().views.length).toBe(1);
    // 相同查询去重
    let again: typeof saved | undefined;
    act(() => {
      again = api().save("另一个名字");
    });
    expect(again?.id).toBe(saved?.id);
    expect(api().views.length).toBe(1);

    const savedId = saved?.id;
    if (!savedId) throw new Error("saved view missing");
    await act(async () => api().update(savedId, "重命名"));
    expect(api().views[0]?.name).toBe("重命名");

    const firstView = api().views[0];
    if (!firstView) throw new Error("view missing");
    await act(async () => api().apply(firstView));
    expect(router.state.location.searchStr).toContain("status=running");
    expect(router.state.location.searchStr).toContain("view=");

    await act(async () => api().remove(savedId));
    expect(api().views.length).toBe(0);
    expect(store.get("fc:view:services")).toBe("[]");

    vi.unstubAllGlobals();
  });
});
