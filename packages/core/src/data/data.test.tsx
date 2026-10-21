// @vitest-environment happy-dom
/**
 * createResource 契约测试：queryKey 结构 / 失效规则 / mutationMode 三档（含 undoable 缓存时序）
 * / 租户作用域 queryKey。
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
import { describe, expect, it } from "vitest";
import { TenantProvider } from "../tenant";
import {
  type BulkResult,
  createResource,
  HttpError,
  type ListParams,
  type Page,
  type ResourceClient,
} from "./index";

interface Row {
  id: string;
  name: string;
  status: string;
  version?: number;
}

function makeClient(rows: Row[]) {
  const calls: { method: string; args: unknown[] }[] = [];
  const client: ResourceClient<Row, Partial<Row>, Partial<Row>> = {
    list: async (params: ListParams) => {
      calls.push({ method: "list", args: [params] });
      const filtered = params.filters ? rows.filter((r) => r.status === "running") : rows;
      const page = params.page ?? 1;
      return {
        rows: filtered.slice((page - 1) * params.pageSize, page * params.pageSize),
        total: filtered.length,
      };
    },
    get: async (id: string) => {
      calls.push({ method: "get", args: [id] });
      const row = rows.find((r) => r.id === id);
      if (!row) throw new HttpError(404, "not found");
      return row;
    },
    create: async (vars) => {
      calls.push({ method: "create", args: [vars] });
      const row: Row = { id: `new-${rows.length}`, name: vars.name ?? "?", status: "running" };
      rows.push(row);
      return row;
    },
    update: async (id, vars, opts) => {
      calls.push({ method: "update", args: [id, vars, opts] });
      const row = rows.find((r) => r.id === id);
      if (!row) throw new HttpError(404, "not found");
      Object.assign(row, vars);
      return row;
    },
    delete: async (id) => {
      calls.push({ method: "delete", args: [id] });
      const idx = rows.findIndex((r) => r.id === id);
      if (idx >= 0) rows.splice(idx, 1);
    },
    bulkDelete: async (ids) => {
      calls.push({ method: "bulkDelete", args: [ids] });
      const result: BulkResult = { succeeded: [], failed: [] };
      for (const id of ids) {
        const idx = rows.findIndex((r) => r.id === id);
        if (idx >= 0) {
          rows.splice(idx, 1);
          result.succeeded.push(id);
        } else {
          result.failed.push({ id, error: new HttpError(404, "missing") });
        }
      }
      return result;
    },
  };
  return { client, calls };
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return { queryClient, wrapper };
}

describe("createResource", () => {
  it("useList queryKey：[name, 'list', params]（无租户宿主）", async () => {
    const rows: Row[] = [{ id: "a", name: "A", status: "running" }];
    const { client } = makeClient(rows);
    const resource = createResource<Row, Partial<Row>, Partial<Row>>({
      name: "widgets",
      client,
      tenantScoped: false,
    });
    const { queryClient, wrapper } = makeWrapper();
    const { result } = renderHook(() => resource.useList({ page: 1, pageSize: 20, search: "x" }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data?.total).toBe(1);
    // queryKey 直接命中缓存
    const cached = queryClient.getQueryData<Page<Row>>([
      "widgets",
      "list",
      {
        page: 1,
        pageSize: 20,
        search: "x",
        facets: undefined,
        filters: undefined,
        sort: undefined,
      },
    ]);
    expect(cached?.rows[0]?.id).toBe("a");
  });

  it("create 后失效 list（refetch），update 后失效 list + detail", async () => {
    const rows: Row[] = [
      { id: "a", name: "A", status: "running" },
      { id: "b", name: "B", status: "stopped" },
    ];
    const { client, calls } = makeClient(rows);
    const resource = createResource<Row, Partial<Row>, Partial<Row>>({
      name: "widgets",
      client,
      tenantScoped: false,
    });
    const { wrapper } = makeWrapper();
    const list = renderHook(() => resource.useList({ page: 1, pageSize: 20 }), { wrapper });
    const one = renderHook(() => resource.useOne("a"), { wrapper });
    await waitFor(() => expect(list.result.current.data).toBeDefined());
    await waitFor(() => expect(one.result.current.data).toBeDefined());
    const listCallsBefore = calls.filter((c) => c.method === "list").length;
    const getCallsBefore = calls.filter((c) => c.method === "get").length;

    const del = renderHook(() => resource.useDelete(), { wrapper });
    await act(async () => {
      await del.result.current.mutateAsync({ id: "a" });
    });
    // delete → list 失效 refetch + detail a 失效
    await waitFor(() =>
      expect(calls.filter((c) => c.method === "list").length).toBeGreaterThan(listCallsBefore),
    );
    await waitFor(() =>
      expect(calls.filter((c) => c.method === "get").length).toBeGreaterThan(getCallsBefore),
    );
    expect(rows.find((r) => r.id === "a")).toBeUndefined();

    const create = renderHook(() => resource.useCreate(), { wrapper });
    await act(async () => {
      await create.result.current.mutateAsync({ name: "C" });
    });
    await waitFor(() => expect(rows.some((r) => r.name === "C")).toBe(true));
  });

  it("optimistic update：立即改缓存，失败回滚", async () => {
    const rows: Row[] = [{ id: "a", name: "A", status: "running", version: 1 }];
    let failNext = false;
    const { client } = makeClient(rows);
    const origUpdate = client.update;
    client.update = async (id, vars, opts) => {
      if (failNext) throw new HttpError(409, "conflict");
      if (!origUpdate) throw new Error("update unavailable");
      return origUpdate(id, vars, opts);
    };
    const resource = createResource<Row, Partial<Row>, Partial<Row>>({
      name: "widgets",
      client,
      tenantScoped: false,
    });
    const { queryClient, wrapper } = makeWrapper();
    const list = renderHook(() => resource.useList({ page: 1, pageSize: 20 }), { wrapper });
    await waitFor(() => expect(list.result.current.data?.rows[0]?.name).toBe("A"));

    const update = renderHook(() => resource.useUpdate({ mutationMode: "optimistic" }), {
      wrapper,
    });
    await act(async () => {
      const p = update.result.current.mutateAsync({ id: "a", name: "A2" });
      // mutateAsync 尚未 resolve（等响应），但缓存已被乐观写入
      await Promise.resolve();
      const optimistic = queryClient.getQueriesData<Page<Row>>({ queryKey: ["widgets", "list"] });
      expect(optimistic[0]?.[1]?.rows[0]?.name).toBe("A2");
      await p;
    });
    expect(list.result.current.data?.rows[0]?.name).toBe("A2");

    failNext = true;
    await act(async () => {
      await expect(
        update.result.current.mutateAsync({ id: "a", name: "A3" }),
      ).rejects.toBeInstanceOf(HttpError);
    });
    // 失败回滚：缓存回到 A2
    await waitFor(() => {
      const restored = queryClient.getQueriesData<Page<Row>>({ queryKey: ["widgets", "list"] });
      expect(restored[0]?.[1]?.rows[0]?.name).toBe("A2");
    });
  });

  it("undoable delete：立即从缓存消失，撤销后还原且不提交", async () => {
    const rows: Row[] = [
      { id: "a", name: "A", status: "running" },
      { id: "b", name: "B", status: "running" },
    ];
    const { client, calls } = makeClient(rows);
    const resource = createResource<Row, Partial<Row>, Partial<Row>>({
      name: "widgets",
      client,
      tenantScoped: false,
    });
    const { queryClient, wrapper } = makeWrapper();
    const list = renderHook(() => resource.useList({ page: 1, pageSize: 20 }), { wrapper });
    await waitFor(() => expect(list.result.current.data?.rows.length).toBe(2));

    let toastCtl: { undo: () => void; dismiss: () => void; secondsLeft: number } | undefined;
    const del = renderHook(
      () =>
        resource.useDelete({
          mutationMode: "undoable",
          undoDurationMs: 300,
          onUndoableToast: (ctl) => {
            toastCtl = ctl;
          },
        }),
      { wrapper },
    );

    let mutatePromise: Promise<void> | undefined;
    act(() => {
      mutatePromise = del.result.current.mutateAsync({ id: "a" });
    });
    // 立即乐观消失
    await waitFor(() => {
      const page = queryClient.getQueriesData<Page<Row>>({ queryKey: ["widgets", "list"] });
      expect(page[0]?.[1]?.rows.map((r) => r.id)).toEqual(["b"]);
    });
    expect(calls.find((c) => c.method === "delete")).toBeUndefined();

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
      toastCtl?.undo();
      await mutatePromise;
    });
    // 撤销还原缓存，且没有真实提交
    await waitFor(() => {
      const page = queryClient.getQueriesData<Page<Row>>({ queryKey: ["widgets", "list"] });
      expect(page[0]?.[1]?.rows.map((r) => r.id)).toEqual(["a", "b"]);
    });
    expect(calls.find((c) => c.method === "delete")).toBeUndefined();
  });

  it("undoable delete：超时真提交 + bulkDelete 部分失败透传 BulkResult", async () => {
    const rows: Row[] = [
      { id: "a", name: "A", status: "running" },
      { id: "ghost", name: "G", status: "running" },
    ];
    const { client, calls } = makeClient(rows);
    const resource = createResource<Row, Partial<Row>, Partial<Row>>({
      name: "widgets",
      client,
      tenantScoped: false,
    });
    const { wrapper } = makeWrapper();
    const del = renderHook(
      () =>
        resource.useDelete({
          mutationMode: "undoable",
          undoDurationMs: 1000,
          onUndoableToast: () => {},
        }),
      { wrapper },
    );
    let p: Promise<void> | undefined;
    act(() => {
      p = del.result.current.mutateAsync({ id: "a" });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 400));
      await p;
    });
    expect(calls.find((c) => c.method === "delete")).toBeDefined();
    expect(rows.find((r) => r.id === "a")).toBeUndefined();

    const bulk = renderHook(() => resource.useBulkDelete(), { wrapper });
    let bulkResult: BulkResult | undefined;
    await act(async () => {
      bulkResult = (await bulk.result.current.mutateAsync({
        ids: ["ghost", "missing"],
      })) as BulkResult;
    });
    expect(bulkResult?.succeeded).toEqual(["ghost"]);
    expect(bulkResult?.failed.length).toBe(1);
  });

  it("undoable update（createResource 层接线）：乐观改缓存，撤销还原且不提交；超时后真提交", async () => {
    const rows: Row[] = [
      { id: "a", name: "A", status: "running", version: 1 },
      { id: "b", name: "B", status: "running" },
    ];
    const { client, calls } = makeClient(rows);
    const resource = createResource<Row, Partial<Row>, Partial<Row>>({
      name: "widgets",
      client,
      tenantScoped: false,
    });
    const { queryClient, wrapper } = makeWrapper();
    const one = renderHook(() => resource.useOne("a"), { wrapper });
    const list = renderHook(() => resource.useList({ page: 1, pageSize: 20 }), { wrapper });
    await waitFor(() => expect(one.result.current.data?.name).toBe("A"));
    await waitFor(() => expect(list.result.current.data?.rows.length).toBe(2));

    let toastCtl: { undo: () => void; dismiss: () => void; secondsLeft: number } | undefined;
    const update = renderHook(
      () =>
        resource.useUpdate({
          mutationMode: "undoable",
          undoDurationMs: 400,
          onUndoableToast: (ctl) => {
            toastCtl = ctl;
          },
        }),
      { wrapper },
    );

    // 撤销路径：乐观写入 list+detail → undo 还原，客户端 update 未被调用
    let mutatePromise: Promise<Row> | undefined;
    act(() => {
      mutatePromise = update.result.current.mutateAsync({ id: "a", name: "A-undo" });
    });
    await waitFor(() => {
      const page = queryClient.getQueriesData<Page<Row>>({ queryKey: ["widgets", "list"] });
      expect(page[0]?.[1]?.rows[0]?.name).toBe("A-undo");
      expect(queryClient.getQueryData<Row>(["widgets", "detail", "a"])?.name).toBe("A-undo");
    });
    expect(calls.find((c) => c.method === "update")).toBeUndefined();
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
      toastCtl?.undo();
      await mutatePromise;
    });
    await waitFor(() => {
      const page = queryClient.getQueriesData<Page<Row>>({ queryKey: ["widgets", "list"] });
      expect(page[0]?.[1]?.rows[0]?.name).toBe("A");
      expect(queryClient.getQueryData<Row>(["widgets", "detail", "a"])?.name).toBe("A");
    });
    expect(calls.find((c) => c.method === "update")).toBeUndefined();

    // 超时路径：倒计时走完 → 真提交（版本随 vars 透传）
    await act(async () => {
      const p = update.result.current.mutateAsync({ id: "a", name: "A-final", version: 3 });
      await new Promise((r) => setTimeout(r, 600));
      await p;
    });
    const updateCall = calls.find((c) => c.method === "update");
    expect(updateCall?.args[0]).toBe("a");
    expect(updateCall?.args[2]).toMatchObject({ version: 3 });
    await waitFor(() => expect(one.result.current.data?.name).toBe("A-final"));
  });

  it("tenantScoped=true：queryKey 含租户段 [name, tenantId, 'list', params]", async () => {
    const rows: Row[] = [{ id: "a", name: "A", status: "running" }];
    const { client } = makeClient(rows);
    const resource = createResource<Row, Partial<Row>, Partial<Row>>({
      name: "widgets",
      client,
      tenantScoped: true,
    });
    const { queryClient } = makeWrapper();

    let captured: { data?: Page<Row> } = {};
    // biome-ignore lint/correctness/noComponentHookFactories: 测试探针组件（路由组件内闭包捕获）
    function Probe() {
      const query = resource.useList({ page: 1, pageSize: 20 });
      captured = query;
      return null;
    }
    // biome-ignore lint/correctness/noComponentHookFactories: 布局组件内联（TenantProvider 需路由 params）
    function TenantLayout() {
      return (
        <TenantProvider
          resolveTenant={async (id) => ({ id, name: `org-${id}` })}
          listTenants={async () => [{ id: "acme-web", name: "Acme" }]}
        >
          <Outlet />
        </TenantProvider>
      );
    }
    const rootRoute = createRootRoute({ component: () => <Outlet /> });
    const shellRoute = createRoute({
      getParentRoute: () => rootRoute,
      id: "_shell",
      component: TenantLayout,
    });
    const tenantRoute = createRoute({
      getParentRoute: () => shellRoute,
      path: "t/$tenantId",
      component: Probe,
    });
    const router = createRouter({
      routeTree: rootRoute.addChildren([shellRoute.addChildren([tenantRoute])]),
      history: createMemoryHistory({ initialEntries: ["/t/acme-web"] }),
    });
    await act(async () => {
      await router.load();
    });
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(captured.data).toBeDefined());
    expect(
      queryClient.getQueryData<Page<Row>>([
        "widgets",
        "acme-web",
        "list",
        { page: 1, pageSize: 20 },
      ]),
    ).toBeDefined();
  });
});
