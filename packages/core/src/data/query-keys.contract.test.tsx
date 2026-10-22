// @vitest-environment happy-dom
/**
 * queryKey 工厂跨模块一致性契约测试（docs/paradigm.md §5-B 任务2）：
 *  1. 工厂三形（listKey/detailKey/manyKey）形状钉死（含 tenantId 缺省省略段、many 去重排序）；
 *  2. data（createResource useList/useOne）产出的 queryKey 与工厂一致；
 *  3. reference（useReference）产出的 queryKey 与 manyKey 一致；
 *  4. 失效语义不被破坏：delete → list 前缀 + detail 失效（工厂前缀命中工厂产出的 key）。
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useReference } from "../reference";
import type { ListParams, ResourceClient } from "./index";
import { createResource, detailKey, listKey, manyKey } from "./index";

interface Row {
  id: string;
  name: string;
}

function makeClient(rows: Row[]) {
  const calls: { method: string; args: unknown[] }[] = [];
  const client: ResourceClient<Row, Partial<Row>, Partial<Row>> = {
    list: async (params: ListParams) => {
      calls.push({ method: "list", args: [params] });
      return { rows, total: rows.length };
    },
    get: async (id: string) => {
      calls.push({ method: "get", args: [id] });
      const row = rows.find((r) => r.id === id);
      if (!row) throw new Error("not found");
      return row;
    },
    delete: async (id: string) => {
      calls.push({ method: "delete", args: [id] });
    },
  };
  return { client, calls };
}

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return {
    queryClient,
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

describe("queryKey 工厂形状（core-api.md §1 queryKey 约定）", () => {
  it("listKey：[name, tenantId?, 'list', params]；tenantId 缺省省略该段", () => {
    const params = { page: 1, pageSize: 20 };
    expect(listKey("widgets", params)).toEqual(["widgets", "list", params]);
    expect(listKey("widgets", params, { tenantId: "acme" })).toEqual([
      "widgets",
      "acme",
      "list",
      params,
    ]);
    expect(listKey("widgets", params, {})).toEqual(["widgets", "list", params]);
  });

  it("detailKey：[name, tenantId?, 'detail', id]", () => {
    expect(detailKey("widgets", "a")).toEqual(["widgets", "detail", "a"]);
    expect(detailKey("widgets", "a", { tenantId: "acme" })).toEqual([
      "widgets",
      "acme",
      "detail",
      "a",
    ]);
  });

  it("manyKey：[name, tenantId?, 'many', ids 去重排序后]", () => {
    expect(manyKey("users", ["c", "a", "a", "b"])).toEqual(["users", "many", ["a", "b", "c"]]);
    expect(manyKey("users", ["b", "a"], { tenantId: "t1" })).toEqual([
      "users",
      "t1",
      "many",
      ["a", "b"],
    ]);
  });
});

describe("data（createResource）与工厂一致", () => {
  it("useList/useOne 的缓存 key === listKey/detailKey 产出", async () => {
    const rows: Row[] = [{ id: "a", name: "A" }];
    const { client } = makeClient(rows);
    const resource = createResource<Row, Partial<Row>, Partial<Row>>({
      name: "widgets",
      client,
      tenantScoped: false,
    });
    const { queryClient, wrapper } = makeWrapper();
    const list = renderHook(() => resource.useList({ page: 1, pageSize: 20 }), { wrapper });
    const one = renderHook(() => resource.useOne("a"), { wrapper });
    await waitFor(() => expect(list.result.current.data).toBeDefined());
    await waitFor(() => expect(one.result.current.data).toBeDefined());

    const listParams = { page: 1, pageSize: 20 };
    expect(queryClient.getQueryData(listKey("widgets", listParams))).toBeDefined();
    expect(queryClient.getQueryData(detailKey("widgets", "a"))).toMatchObject({ id: "a" });
  });
});

describe("reference（useReference）与工厂一致", () => {
  it("useReference 的缓存 key === manyKey 产出（同 ids 共享缓存）", async () => {
    const rows: Row[] = [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ];
    const resource = createResource<Row, Partial<Row>, Partial<Row>>({
      name: "widgets",
      client: makeClient(rows).client,
      tenantScoped: false,
    });
    const { queryClient, wrapper } = makeWrapper();

    const { result } = renderHook(() => useReference(resource, ["b", "a", "b"]), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data.a?.name).toBe("A");
    expect(result.current.data.b?.name).toBe("B");
    // 缓存命中工厂 key（ids 去重排序后）
    const page = queryClient.getQueryData<unknown[]>(manyKey("widgets", ["a", "b"]));
    expect(Array.isArray(page) && page.length).toBe(2);
  });
});

describe("失效语义不被破坏（工厂前缀命中工厂 key）", () => {
  it("delete → 命中 listKey 前缀的列表 refetch + detailKey 失效", async () => {
    const rows: Row[] = [{ id: "a", name: "A" }];
    const { client, calls } = makeClient(rows);
    const resource = createResource<Row, Partial<Row>, Partial<Row>>({
      name: "widgets",
      client,
      tenantScoped: false,
    });
    const { wrapper } = makeWrapper();
    const list = renderHook(() => resource.useList({ page: 1, pageSize: 20, search: "x" }), {
      wrapper,
    });
    const one = renderHook(() => resource.useOne("a"), { wrapper });
    await waitFor(() => expect(list.result.current.data).toBeDefined());
    await waitFor(() => expect(one.result.current.data).toBeDefined());
    const listCallsBefore = calls.filter((c) => c.method === "list").length;
    const getCallsBefore = calls.filter((c) => c.method === "get").length;

    const del = renderHook(() => resource.useDelete(), { wrapper });
    await act(async () => {
      await del.result.current.mutateAsync({ id: "a" });
    });
    // 工厂产出的 list key 落在失效前缀命中域内 → refetch
    await waitFor(() =>
      expect(calls.filter((c) => c.method === "list").length).toBeGreaterThan(listCallsBefore),
    );
    // 工厂产出的 detail key 同样被失效 → refetch
    await waitFor(() =>
      expect(calls.filter((c) => c.method === "get").length).toBeGreaterThan(getCallsBefore),
    );
  });
});
