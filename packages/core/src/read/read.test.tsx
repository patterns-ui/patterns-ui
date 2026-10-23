// @vitest-environment happy-dom
/**
 * read-state 元模式引擎单测（M7-C2）：未读计数共享缓存（同 name 单请求）、单条已读
 * （pessimistic 服务器确认 / optimistic 乐观翻转成功路径）、乐观翻转失败回滚、
 * 全部已读（专用端点优先 / 逐条扇出回落 / 无写能力静默返回）、单条已读无 update 能力的
 * 契约错误。headless：只经 renderHook 驱动，不渲染任何 UI。
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ListParams, Page } from "../data";
import {
  READ_STATE,
  type ReadStateClient,
  type ReadStateRow,
  useReadState,
  useUnreadCount,
} from "./index";

interface Note extends ReadStateRow {
  title: string;
}

function seed(count: number, unread: number): Note[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `note-${String(i + 1).padStart(2, "0")}`,
    title: `通知 ${i + 1}`,
    read: i >= unread,
  }));
}

interface Harness {
  rows: Note[];
  listCalls: ListParams[];
  updateCalls: { id: string; vars: Partial<Note> }[];
  markAllCalls: string[][];
  listError?: Error;
  updateError?: Error;
  markAllError?: Error;
}

function makeClient(harness: Harness, withEndpoints: { update: boolean; markAllRead: boolean }) {
  const client: ReadStateClient<Note> = {
    list: async (params) => {
      harness.listCalls.push(params);
      if (harness.listError) throw harness.listError;
      const page: Page<Note> = { rows: [...harness.rows], nextCursor: undefined };
      return page;
    },
  };
  if (withEndpoints.update) {
    client.update = async (id, vars) => {
      harness.updateCalls.push({ id, vars });
      if (harness.updateError) throw harness.updateError;
      harness.rows = harness.rows.map((r) => (r.id === id ? ({ ...r, ...vars } as Note) : r));
      return harness.rows.find((r) => r.id === id) as Note;
    };
  }
  if (withEndpoints.markAllRead) {
    client.markAllRead = async (ids) => {
      harness.markAllCalls.push(ids);
      if (harness.markAllError) throw harness.markAllError;
      for (const row of harness.rows) if (ids.includes(row.id)) row.read = true;
      return { updated: ids.length };
    };
  }
  return client;
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

type FeedResult = ReturnType<typeof useReadState<Note>>;

function renderFeed(
  opts: Partial<Parameters<typeof useReadState<Note>>[0]> & { client: ReadStateClient<Note> },
) {
  const { wrapper, queryClient } = makeWrapper();
  const rtl = renderHook(() => useReadState<Note>({ name: "notifications", ...opts }), {
    wrapper,
  });
  return {
    queryClient,
    ...rtl,
    result: rtl.result as unknown as { current: FeedResult },
  } as unknown as {
    queryClient: QueryClient;
    result: { current: FeedResult };
    rerender: (props?: unknown) => void;
    unmount: () => void;
  };
}

describe("useReadState", () => {
  it("未读计数共享缓存：收件箱与 badge 同 name → client.list 只请求一次", async () => {
    const harness: Harness = {
      rows: seed(30, 4),
      listCalls: [],
      updateCalls: [],
      markAllCalls: [],
    };
    const client = makeClient(harness, { update: true, markAllRead: true });
    const { wrapper } = makeWrapper();
    const rtl = renderHook(
      () => ({
        feed: useReadState<Note>({ name: "notifications", client }),
        badge: useUnreadCount("notifications", client),
      }),
      { wrapper },
    );
    await waitFor(() => expect(rtl.result.current.feed.rows.length).toBe(30));
    expect(rtl.result.current.feed.unreadCount).toBe(4);
    expect(rtl.result.current.badge).toBe(4);
    expect(harness.listCalls.length).toBe(1); // 共享 queryKey，不重复请求
    expect(harness.listCalls[0]?.pageSize).toBe(30);
    rtl.unmount();
  });

  it("pessimistic 单条已读：update(id,{read:true}) → 失效刷新 → 未读数递减", async () => {
    const harness: Harness = { rows: seed(3, 2), listCalls: [], updateCalls: [], markAllCalls: [] };
    const client = makeClient(harness, { update: true, markAllRead: false });
    const { result } = renderFeed({ client });
    await waitFor(() => expect(result.current.unreadCount).toBe(2));

    await act(async () => {
      result.current.markRead.mutate({ id: "note-01", title: "通知 1", read: false });
    });
    await waitFor(() => expect(result.current.unreadCount).toBe(1));
    expect(harness.updateCalls).toEqual([{ id: "note-01", vars: { read: true } }]);
    expect(harness.listCalls.length).toBeGreaterThanOrEqual(2); // 失效后 refetch
  });

  it("optimistic 乐观翻转：提交即翻已读（不等服务器），成功后失效刷新", async () => {
    const harness: Harness = { rows: seed(3, 2), listCalls: [], updateCalls: [], markAllCalls: [] };
    const client = makeClient(harness, { update: true, markAllRead: false });
    let release: (() => void) | undefined;
    client.update = (id, vars) => {
      harness.updateCalls.push({ id, vars });
      return new Promise<Note>((resolve) => {
        release = () => resolve({ id, title: "通知 1", read: true } as Note);
      });
    };
    const { result } = renderFeed({ client, mutationMode: "optimistic" });
    await waitFor(() => expect(result.current.unreadCount).toBe(2));

    await act(async () => {
      result.current.markRead.mutate({ id: "note-01", title: "通知 1", read: false });
    });
    await waitFor(() => expect(result.current.unreadCount).toBe(1)); // 未确认即翻
    expect(release).toBeDefined();
    await act(async () => release?.());
    await waitFor(() => expect(result.current.markRead.isSuccess).toBe(true));
  });

  it("乐观翻转失败回滚：update 拒绝 → 缓存恢复未读、mutation.error 可见、失效刷新对账", async () => {
    const harness: Harness = { rows: seed(3, 2), listCalls: [], updateCalls: [], markAllCalls: [] };
    const client = makeClient(harness, { update: true, markAllRead: false });
    harness.updateError = new Error("PATCH 500");
    const { result } = renderFeed({ client, mutationMode: "optimistic" });
    await waitFor(() => expect(result.current.unreadCount).toBe(2));

    await act(async () => {
      result.current.markRead.mutate({ id: "note-01", title: "t", read: false });
    });
    // 乐观翻转已发生 → 失败回滚 → 最终回到 2（onSettled 失效 refetch 拿服务端真相）
    await waitFor(() => expect(result.current.markRead.isError).toBe(true));
    await waitFor(() => expect(result.current.unreadCount).toBe(2));
    expect(result.current.markRead.error?.message).toContain("PATCH 500");
    expect(harness.updateCalls.length).toBe(1);
  });

  it("全部已读：专用端点优先，携带未读 id 清单", async () => {
    const harness: Harness = { rows: seed(5, 3), listCalls: [], updateCalls: [], markAllCalls: [] };
    const client = makeClient(harness, { update: true, markAllRead: true });
    const { result } = renderFeed({ client });
    await waitFor(() => expect(result.current.unreadCount).toBe(3));

    await act(async () => result.current.markAllRead());
    expect(harness.markAllCalls).toEqual([["note-01", "note-02", "note-03"]]);
    expect(harness.updateCalls).toEqual([]); // 专用端点在场不走扇出
    await waitFor(() => expect(result.current.unreadCount).toBe(0));
    expect(result.current.markingAll).toBe(false);
  });

  it("全部已读回落：无专用端点 → 逐条 update 扇出", async () => {
    const harness: Harness = { rows: seed(4, 2), listCalls: [], updateCalls: [], markAllCalls: [] };
    const client = makeClient(harness, { update: true, markAllRead: false });
    const { result } = renderFeed({ client });
    await waitFor(() => expect(result.current.unreadCount).toBe(2));

    await act(async () => result.current.markAllRead());
    expect(harness.updateCalls.map((c) => c.id)).toEqual(["note-01", "note-02"]);
    await waitFor(() => expect(result.current.unreadCount).toBe(0));
  });

  it("无写能力：markAllRead 静默返回（零请求、不抛错）——preset 降级语义", async () => {
    const harness: Harness = { rows: seed(3, 2), listCalls: [], updateCalls: [], markAllCalls: [] };
    const client = makeClient(harness, { update: false, markAllRead: false });
    const { result } = renderFeed({ client });
    await waitFor(() => expect(result.current.unreadCount).toBe(2));

    await act(async () => {
      await result.current.markAllRead(); // 不 reject
    });
    expect(harness.updateCalls).toEqual([]);
    expect(harness.markAllCalls).toEqual([]);
    expect(result.current.unreadCount).toBe(2);
  });

  it("单条已读无 update 能力：mutation.error 携带契约错误（不向调用方抛出）", async () => {
    const harness: Harness = { rows: seed(3, 2), listCalls: [], updateCalls: [], markAllCalls: [] };
    const client = makeClient(harness, { update: false, markAllRead: true });
    const { result } = renderFeed({ client });
    await waitFor(() => expect(result.current.rows.length).toBe(3));

    await act(async () => {
      result.current.markRead.mutate({ id: "note-01", title: "t", read: false });
    });
    await waitFor(() => expect(result.current.markRead.isError).toBe(true));
    expect(result.current.markRead.error?.message).toContain("client.update 缺失");
    expect(result.current.markRead.error?.message).toContain(`v${READ_STATE.contractVersion}`);
  });

  it("useUnreadCount：缺省 15s staleTime 的共享缓存查询，返回未读数", async () => {
    const harness: Harness = {
      rows: seed(10, 7),
      listCalls: [],
      updateCalls: [],
      markAllCalls: [],
    };
    const client = makeClient(harness, { update: true, markAllRead: false });
    const { wrapper } = makeWrapper();
    const rtl = renderHook(() => useUnreadCount("notifications", client), { wrapper });
    await waitFor(() => expect(rtl.result.current).toBe(7));
    expect(harness.listCalls[0]?.sort).toEqual([{ field: "createdAt", direction: "desc" }]);
    rtl.unmount();
  });
});
