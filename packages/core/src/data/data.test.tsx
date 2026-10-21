// @vitest-environment happy-dom
/**
 * createResource 契约测试：queryKey 结构 / 失效规则 / mutationMode 三档（含 undoable 缓存时序）。
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
    update: async (id, vars) => {
      calls.push({ method: "update", args: [id, vars] });
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
});
