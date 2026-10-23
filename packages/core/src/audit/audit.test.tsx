// @vitest-environment happy-dom
/**
 * audit-trail 元模式引擎单测（M7-C2）：协议钉死 keyset（paged/load-more 两档）、
 * append-only 游标栈语义、断页（末页 hasNextPage=false）、游标失效容错、过滤变更清栈回第 1 页、
 * 过滤语义面形状、dev 适配器形状校验挂载。headless：只经 renderHook 驱动，不渲染任何 UI。
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createResource, type ListParams, type ResourceClient } from "../data";
import { createListColumnHelper } from "../list";
import { AUDIT_TRAIL, auditTrailFilterDefs, useAuditTrail } from "./index";

interface AuditRow {
  id: string;
  action: string;
  resource: string;
  actor: string;
  createdAt: string;
}

function seed(count: number): AuditRow[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `evt-${String(i + 1).padStart(3, "0")}`,
    action: ["service.create", "service.update", "service.delete"][i % 3] as string,
    resource: `svc-${i % 5}`,
    actor: `user-${i % 4}`,
    createdAt: new Date(2024, 0, 1, 12, 0, i * 10).toISOString(),
  })).reverse(); // createdAt desc
}

interface Harness {
  listCalls: ListParams[];
  rows: AuditRow[];
  /** 模拟游标失效：cursor 命中失败时从第 1 页重发（服务端重启/窗口清理后的常见容错） */
  cursorInvalid: boolean;
}

function makeHarness(initialRows = seed(45)): Harness {
  return { listCalls: [], rows: initialRows, cursorInvalid: false };
}

function makeResource(harness: Harness) {
  const client: ResourceClient<AuditRow, Partial<AuditRow>, Partial<AuditRow>> = {
    list: async (params) => {
      harness.listCalls.push(params);
      const pageSize = params.pageSize;
      let start = 0;
      if (params.cursor !== undefined) {
        const idx = harness.rows.findIndex((r) => r.id === params.cursor);
        start = idx >= 0 && !harness.cursorInvalid ? idx + 1 : 0; // 失效 → 回第 1 页数据
      }
      const slice = harness.rows.slice(start, start + pageSize);
      const hasMore = start + pageSize < harness.rows.length;
      return {
        rows: slice,
        nextCursor: hasMore ? slice.at(-1)?.id : undefined,
        facets: params.facets
          ? params.facets.map((field) => ({
              field,
              buckets: [
                { value: "service.create", count: 15 },
                { value: "service.update", count: 20 },
                { value: "service.delete", count: 10 },
              ],
            }))
          : undefined,
      };
    },
    get: async (id) => harness.rows.find((r) => r.id === id) as AuditRow,
  };
  return createResource<AuditRow, Partial<AuditRow>, Partial<AuditRow>>({
    name: "audit-events",
    client,
    tenantScoped: false,
  });
}

const helper = createListColumnHelper<AuditRow>();
const columns = [
  helper.accessor("action", { header: "Action" }),
  helper.accessor("createdAt", { header: "Time" }),
];

const ACTION_OPTIONS = [
  { value: "service.create", label: "创建" },
  { value: "service.update", label: "更新" },
  { value: "service.delete", label: "删除" },
];

type TrailResult = ReturnType<typeof useAuditTrail<AuditRow>>;

function renderTrail(
  options: Partial<Parameters<typeof useAuditTrail<AuditRow>>[0]>,
  harness: Harness,
) {
  const resource = makeResource(harness);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  const rtl = renderHook(
    () =>
      useAuditTrail<AuditRow>({
        resource,
        columns,
        actionOptions: ACTION_OPTIONS,
        syncWithLocation: false,
        queryOptions: { staleTime: 60_000 },
        ...options,
      } as Parameters<typeof useAuditTrail<AuditRow>>[0]),
    { wrapper },
  );
  return rtl as unknown as {
    result: { current: TrailResult };
    unmount: () => void;
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useAuditTrail", () => {
  it("协议钉死 keyset：paged → server-cursor，load-more → load-more；能力派生无 canJump/无 total/token 留内存", async () => {
    const harness = makeHarness();
    const { result } = renderTrail({ shape: "paged" }, harness);
    await waitFor(() => expect(result.current.list.query.data?.rows.length).toBe(20));
    expect(result.current.mode).toBe("server-cursor");
    expect(result.current.capabilities).toEqual({
      canJump: false,
      hasTotal: false,
      tokenInMemory: true,
    });
    // token 不进 URL（栈在内存）；首页数据到达后栈记下第 2 页 token
    await waitFor(() => expect(result.current.list.cursorStack).toEqual(["evt-026"]));
  });

  it("append-only 游标栈：翻页用上一页 nextCursor 作 cursor；后退命中缓存零新请求", async () => {
    const harness = makeHarness();
    const { result } = renderTrail({ shape: "paged" }, harness);
    await waitFor(() => expect(result.current.list.query.data?.rows.length).toBe(20));

    await act(async () => result.current.list.nextPage());
    await waitFor(() => expect(result.current.list.state.page).toBe(2));
    const page2Cursor = harness.listCalls.at(-1)?.cursor;
    expect(page2Cursor).toBe("evt-026"); // 第 1 页末行 id（createdAt desc 种子）
    expect(result.current.list.cursorStack).toContain("evt-026");

    // 前进第 3 页后回退：cursor 栈只追加不弹（append-only），第 2 页请求被缓存命中
    await act(async () => result.current.list.nextPage());
    await waitFor(() => {
      expect(result.current.list.state.page).toBe(3);
      expect(result.current.list.cursorStack).toEqual(["evt-026", "evt-006"]);
    });
    const callsAtPage3 = harness.listCalls.length;
    await act(async () => result.current.list.prevPage());
    await waitFor(() => expect(result.current.list.state.page).toBe(2));
    expect(harness.listCalls.length).toBe(callsAtPage3); // 后退零新请求
    expect(result.current.list.cursorStack).toEqual(["evt-026", "evt-006"]); // 未弹栈
  });

  it("断页：末页 nextCursor 缺失 → hasNextPage=false（load-more 档恒可累计）", async () => {
    const harness = makeHarness();
    const { result } = renderTrail({ shape: "paged" }, harness);
    await waitFor(() => expect(result.current.list.query.data).toBeDefined());
    expect(result.current.hasNextPage).toBe(true); // 45 行 / 20 档还有下一页

    await act(async () => result.current.list.nextPage());
    await waitFor(() => expect(result.current.list.cursorStack).toEqual(["evt-026", "evt-006"]));
    await act(async () => result.current.list.nextPage());
    await waitFor(() => {
      expect(result.current.list.state.page).toBe(3);
      expect(result.current.hasNextPage).toBe(false); // 第 3 页（41-45 行）为末页
    });
    expect(result.current.list.query.data?.rows.length).toBe(5);
    expect(result.current.list.query.data?.nextCursor).toBeUndefined();
  });

  it("游标失效容错：token 不再命中（服务端清理）→ 后端回第 1 页数据，引擎不炸、正常渲染", async () => {
    const harness = makeHarness();
    const { result } = renderTrail({ shape: "paged" }, harness);
    await waitFor(() => expect(result.current.list.query.data).toBeDefined());
    await act(async () => result.current.list.nextPage());
    await waitFor(() => expect(result.current.list.cursorStack).toEqual(["evt-026", "evt-006"]));

    harness.cursorInvalid = true; // 第 3 页请求时 token 已失效
    await act(async () => result.current.list.nextPage());
    await waitFor(() => expect(harness.listCalls.at(-1)?.cursor).toBe("evt-006"));
    await waitFor(() => expect(result.current.list.query.data?.rows.length).toBe(20)); // 回落第 1 页数据
    expect(result.current.list.query.isError).toBe(false);
  });

  it("load-more 档：loadMore() 累计拼接，hasNextPage 恒真", async () => {
    const harness = makeHarness();
    const { result } = renderTrail({ shape: "load-more" }, harness);
    await waitFor(() => expect(result.current.list.table.getRowModel().rows.length).toBe(20));
    expect(result.current.mode).toBe("load-more");
    expect(result.current.hasNextPage).toBe(true);

    await act(async () => result.current.list.loadMore());
    await waitFor(() => expect(result.current.list.table.getRowModel().rows.length).toBe(40));
    expect(harness.listCalls.at(-1)?.cursor).toBe("evt-026");
  });

  it("过滤变更 → 回第 1 页并清空游标栈（keyset 家族筛选必重置）", async () => {
    const harness = makeHarness();
    const { result } = renderTrail({ shape: "paged" }, harness);
    await waitFor(() => expect(result.current.list.query.data).toBeDefined());
    await act(async () => result.current.list.nextPage());
    await waitFor(() => expect(result.current.list.cursorStack.length).toBe(1));

    await act(async () =>
      result.current.list.applyFilters({ field: "action", op: "in", value: ["service.delete"] }),
    );
    await waitFor(() => expect(result.current.list.state.page).toBe(1));
    expect(result.current.list.cursorStack).toEqual([]);
    expect(result.current.list.effectiveFilters).toBeDefined();
  });

  it("过滤语义面：action facet 多选 + resource/actor 文本 + createdAt 时间范围；文案可注入", () => {
    const defs = auditTrailFilterDefs(ACTION_OPTIONS, {
      action: "动作",
      resource: "资源",
      actor: "操作者",
      createdAt: "时间范围",
    });
    expect(defs.map((d) => d.field)).toEqual(["action", "resource", "actor", "createdAt"]);
    expect(defs.map((d) => d.kind)).toEqual(["multi-select", "text", "text", "date-range"]);
    expect(defs[0]?.label).toBe("动作");
    // 缺省标签回落字段名（引擎不带文案——文案属 ④ 应用层）
    const plain = auditTrailFilterDefs(ACTION_OPTIONS);
    expect(plain[1]?.label).toBe("resource");
  });

  it("请求面：facets 恒请求 action；搜索面缺省 action/resource/actor；pageSize 缺省档", async () => {
    const harness = makeHarness();
    const { result } = renderTrail({}, harness);
    await waitFor(() => expect(result.current.list.query.data).toBeDefined());
    const last = harness.listCalls[0];
    expect(last?.facets).toEqual(["action"]);
    expect(last?.pageSize).toBe(20);
  });

  it("dev 适配器形状校验：残缺 Resource（缺 useList）挂载即 console.warn（校验先于取数，不吞后续错误）", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );
    const broken = { name: "audit-events", client: {} } as unknown as Parameters<
      typeof useAuditTrail<AuditRow>
    >[0]["resource"];
    // 警告先行（validateMetaPatternAdapter 在取数前调用）；残缺适配器的后续行为错误照常抛出（不静默）
    expect(() =>
      renderHook(
        () =>
          useAuditTrail<AuditRow>({
            resource: broken,
            columns,
            actionOptions: ACTION_OPTIONS,
          }),
        { wrapper },
      ),
    ).toThrow(/useList is not a function/);
    expect(
      warn.mock.calls.some((c) => String(c[0]).includes(`[meta-pattern:${AUDIT_TRAIL.name}]`)),
    ).toBe(true);
    errorSpy.mockRestore();
  });
});
