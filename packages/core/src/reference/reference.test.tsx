// @vitest-environment happy-dom
/**
 * useReference 契约测试（docs/core-api.md §4）：getMany 优先、去重、
 * 无 getMany 时 list+in 分块（每块 50）兜底、queryKey [name, tenant?, 'many', idsSorted]、
 * 同 ids 多处调用共享缓存（单次请求）、useReferenceLabel 默认 label。
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createResource, type ListParams, type Page, type ResourceClient } from "../data";
import { useReference, useReferenceLabel } from "./index";

interface Row {
  id: string;
  name: string;
}

function makeClient(rows: Row[], withGetMany: boolean) {
  const calls: { method: string; args: unknown[] }[] = [];
  const client: ResourceClient<Row, Partial<Row>, Partial<Row>> = {
    list: async (params: ListParams) => {
      calls.push({ method: "list", args: [params] });
      const filter = params.filters;
      const wanted =
        filter !== undefined && (filter as { op?: string }).op === "in"
          ? ((filter as { value?: unknown[] }).value ?? []).map(String)
          : undefined;
      const out = wanted ? rows.filter((r) => wanted.includes(r.id)) : rows;
      const page: Page<Row> = { rows: out, total: out.length };
      return page;
    },
    get: async (id: string) => {
      calls.push({ method: "get", args: [id] });
      const row = rows.find((r) => r.id === id);
      if (!row) throw new Error("missing");
      return row;
    },
    ...(withGetMany
      ? {
          getMany: async (ids: string[]) => {
            calls.push({ method: "getMany", args: [ids] });
            return rows.filter((r) => ids.includes(r.id));
          },
        }
      : {}),
  };
  return { client, calls };
}

function makeWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    queryClient,
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    ),
  };
}

describe("useReference", () => {
  it("getMany 优先 + ids 去重", async () => {
    const rows: Row[] = Array.from({ length: 5 }, (_, i) => ({ id: `r${i}`, name: `row-${i}` }));
    const { client, calls } = makeClient(rows, true);
    const resource = createResource<Row, Partial<Row>, Partial<Row>>({
      name: "ref-a",
      client,
      tenantScoped: false,
    });
    const { wrapper } = makeWrapper();

    const { result } = renderHook(() => useReference(resource, ["r3", "r1", "r3", "r1"]), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data.r1).toEqual({ id: "r1", name: "row-1" });
    expect(result.current.data.r3).toEqual({ id: "r3", name: "row-3" });
    expect(Object.keys(result.current.data)).toEqual(["r3", "r1"]);
    expect(calls).toEqual([{ method: "getMany", args: [["r1", "r3"]] }]);
  });

  it("无 getMany：list + in 过滤分块（每块 50）兜底", async () => {
    const rows: Row[] = Array.from({ length: 120 }, (_, i) => ({ id: `x${i}`, name: `n${i}` }));
    const { client, calls } = makeClient(rows, false);
    const resource = createResource<Row, Partial<Row>, Partial<Row>>({
      name: "ref-b",
      client,
      tenantScoped: false,
    });
    const { wrapper } = makeWrapper();
    const ids = [...Array.from({ length: 60 }, (_, i) => `x${i}`), "x119"];

    const { result } = renderHook(() => useReference(resource, ids), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    // 61 个唯一 id → 2 块（50 + 11）
    const listCalls = calls.filter((c) => c.method === "list");
    expect(listCalls.length).toBe(2);
    const firstListCall = listCalls[0];
    expect(firstListCall && (firstListCall.args[0] as ListParams).pageSize).toBe(50);
    expect(result.current.data.x119).toEqual({ id: "x119", name: "n119" });
    expect(result.current.data.x59).toEqual({ id: "x59", name: "n59" });
  });

  it("同 ids 复用缓存：两个 hook 只发一次请求；queryKey 带 'many'+idsSorted", async () => {
    const rows: Row[] = [
      { id: "a", name: "A" },
      { id: "b", name: "B" },
    ];
    const { client, calls } = makeClient(rows, true);
    const resource = createResource<Row, Partial<Row>, Partial<Row>>({
      name: "ref-c",
      client,
      tenantScoped: false,
    });
    const { wrapper, queryClient } = makeWrapper();

    const first = renderHook(() => useReference(resource, ["a", "b"]), { wrapper });
    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    const second = renderHook(() => useReference(resource, ["b", "a"]), { wrapper });
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));
    expect(calls.filter((c) => c.method === "getMany").length).toBe(1);
    expect(queryClient.getQueryData(["ref-c", "many", ["a", "b"]])).toBeDefined();
  });

  it("空 ids：不发请求、isLoading=false", () => {
    const { client, calls } = makeClient([], true);
    const resource = createResource<Row, Partial<Row>, Partial<Row>>({
      name: "ref-d",
      client,
      tenantScoped: false,
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useReference(resource, []), { wrapper });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toEqual({});
    expect(calls.length).toBe(0);
  });
});

describe("useReferenceLabel", () => {
  it("默认 label = name ?? title ?? id；自定义 getter 生效", async () => {
    const rows: Row[] = [
      { id: "a", name: "Alpha" },
      { id: "b", name: "" },
    ];
    const { client } = makeClient(rows, true);
    const resource = createResource<Row, Partial<Row>, Partial<Row>>({
      name: "ref-label",
      client,
      tenantScoped: false,
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useReferenceLabel(resource, ["a", "b", "zz"]), {
      wrapper,
    });
    await waitFor(() => expect(result.current.labels.a).toBe("Alpha"));
    expect(result.current.labels.b).toBe("b"); // name 为空串 → 回落 id
    expect(result.current.labels.zz).toBeUndefined();

    const { result: custom } = renderHook(
      () => useReferenceLabel(resource, ["a"], (row) => `${row.name}!`),
      { wrapper },
    );
    await waitFor(() => expect(custom.current.labels.a).toBe("Alpha!"));
  });
});
