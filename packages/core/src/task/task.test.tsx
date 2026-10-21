// @vitest-environment happy-dom
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Page } from "../data";
import { useNewItemsSignal } from "./index";

interface Item {
  id: string;
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

describe("useNewItemsSignal", () => {
  it("轮询发现新 key → 计数；重复轮询不重复计数；acknowledge 清零 + refetch", async () => {
    const rows: Item[] = [{ id: "a" }, { id: "b" }];
    const list = vi.fn(async (): Promise<Page<Item>> => ({ rows: [...rows] }));
    const { wrapper } = makeWrapper();

    // biome-ignore lint/correctness/noComponentHookFactories: 测试专用 probe hook
    function useProbeSignal() {
      const query = useQuery({
        queryKey: ["probe"],
        queryFn: list,
        refetchInterval: 50,
      });
      return useNewItemsSignal<Item>(query);
    }

    const { result } = renderHook(() => useProbeSignal(), { wrapper });
    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThanOrEqual(1));
    expect(result.current.newCount).toBe(0);

    // 基线（a,b）之后出现新首部 key
    rows.unshift({ id: "new-2" }, { id: "new-1" });
    await waitFor(() => expect(result.current.newCount).toBe(2), { timeout: 2000 });

    // 未确认期间重复轮询不重复计数（同样的 new-1/new-2 已入基线）
    await new Promise((r) => setTimeout(r, 250));
    expect(result.current.newCount).toBe(2);

    const callsBefore = list.mock.calls.length;
    await act(async () => {
      result.current.acknowledge();
    });
    expect(result.current.newCount).toBe(0);
    expect(list.mock.calls.length).toBeGreaterThan(callsBefore);
    await waitFor(() => expect(result.current.newCount).toBe(0));
  });
});
