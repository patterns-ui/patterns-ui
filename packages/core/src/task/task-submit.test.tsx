// @vitest-environment happy-dom
/**
 * useTaskSubmit / useTaskPoll 契约测试（docs/core-api.md §9）：
 * 触发→轮询（react-query refetchInterval）→终态回调；终态停止轮询；卸载清理；taskId 提取。
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { isTerminal, type TaskState, taskIdOf, useTaskPoll, useTaskSubmit } from "./index";

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

function task(overrides: Partial<TaskState>): TaskState {
  return { id: "t1", state: "queued", ...overrides };
}

describe("taskIdOf", () => {
  it("{ taskId } / { id } / { task: { id } } / 字符串", () => {
    expect(taskIdOf({ taskId: "x" })).toBe("x");
    expect(taskIdOf({ id: "y" })).toBe("y");
    expect(taskIdOf({ task: { id: "z" } })).toBe("z");
    expect(taskIdOf("raw")).toBe("raw");
    expect(taskIdOf({ foo: 1 })).toBeUndefined();
    expect(taskIdOf(null)).toBeUndefined();
  });
});

describe("isTerminal", () => {
  it("succeeded/failed 为终态", () => {
    expect(isTerminal("succeeded")).toBe(true);
    expect(isTerminal("failed")).toBe(true);
    expect(isTerminal("queued")).toBe(false);
    expect(isTerminal("running")).toBe(false);
  });
});

describe("useTaskSubmit", () => {
  it("触发→轮询（refetchInterval）→终态返回 + onDone 回调", async () => {
    const states: TaskState["state"][] = ["queued", "running", "succeeded"];
    let call = 0;
    const getTask = vi.fn(async (): Promise<TaskState> => {
      const state = states[Math.min(call, states.length - 1)];
      call += 1;
      return task({ state, progress: Math.min(call * 40, 100) });
    });
    const onDone = vi.fn();
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useTaskSubmit(getTask, { pollIntervalMs: 10, onDone }), {
      wrapper,
    });

    // 轮询由 refetchInterval 定时器驱动：act 内 await 会饿死真实定时器，
    // 改为 act 内启动 + waitFor 等终态（waitFor 让事件循环推进）
    let final: TaskState | undefined;
    act(() => {
      void result.current
        .submit(async () => ({ taskId: "t1" }))
        .then((t) => {
          final = t;
        });
    });
    await waitFor(() => expect(final?.state).toBe("succeeded"), { timeout: 3000 });
    expect(getTask.mock.calls.length).toBe(3);
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ state: "succeeded" }));
  });

  it("触发响应缺 taskId → 抛错", async () => {
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useTaskSubmit(vi.fn(), { pollIntervalMs: 10 }), {
      wrapper,
    });
    let caught: unknown;
    await act(async () => {
      caught = await result.current.submit(async () => ({ nope: 1 })).catch((e: unknown) => e);
    });
    expect(caught).toBeInstanceOf(Error);
    expect((caught as Error).message).toContain("taskId");
  });

  it("卸载停止轮询，submit 返回最后已知状态", async () => {
    const states: TaskState["state"][] = ["queued", "running", "running", "running"];
    let call = 0;
    const getTask = vi.fn(async (): Promise<TaskState> => {
      const state = states[Math.min(call, states.length - 1)];
      call += 1;
      return task({ state });
    });
    const { wrapper } = makeWrapper();
    const { result, unmount } = renderHook(() => useTaskSubmit(getTask, { pollIntervalMs: 10 }), {
      wrapper,
    });

    let settled: TaskState | undefined;
    let pending: Promise<TaskState> | undefined;
    act(() => {
      pending = result.current.submit(async () => ({ taskId: "t1" }));
      void pending.then((t) => {
        settled = t;
      });
    });
    // 至少两次轮询（真实定时器经 waitFor 推进）
    await waitFor(() => expect(getTask.mock.calls.length).toBeGreaterThanOrEqual(2), {
      timeout: 3000,
    });
    unmount();
    if (!pending) throw new Error("submit promise missing");
    const final = await pending;
    expect(final.state).not.toBe("succeeded"); // 非终态：最后已知状态
    expect(settled?.state).toBe("running");
    const callsAtUnmount = getTask.mock.calls.length;
    await new Promise((r) => setTimeout(r, 40));
    expect(getTask.mock.calls.length).toBe(callsAtUnmount); // 卸载后不再轮询
  });
});

describe("useTaskPoll", () => {
  it("轮询至终态停止（不再发请求）；taskId 变化重置", async () => {
    const states: TaskState["state"][] = ["queued", "running", "running", "succeeded"];
    let call = 0;
    const getTask = vi.fn(async (_id: string): Promise<TaskState> => {
      const state = states[Math.min(call, states.length - 1)];
      call += 1;
      return task({ state });
    });
    const onDone = vi.fn();
    const { wrapper } = makeWrapper();
    const { result, rerender } = renderHook(
      ({ taskId }: { taskId: string | undefined }) =>
        useTaskPoll(taskId, getTask, { intervalMs: 5, onDone }),
      { wrapper, initialProps: { taskId: "t1" as string | undefined } },
    );
    // refetchInterval 由真实定时器驱动（notifyManager 亦走 setTimeout(0) 宏任务），
    // 统一用 waitFor 观察状态推进（间隔小，中间态不逐步断言——只钉终态与停止语义）
    await waitFor(() => expect(result.current?.state).toBe("succeeded"), { timeout: 2000 });
    expect(getTask.mock.calls.length).toBeGreaterThanOrEqual(4); // 轮询确已发生
    const callsAtTerminal = getTask.mock.calls.length;
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ state: "succeeded" }));

    // 终态后继续推进时间 → 不再请求
    await new Promise((r) => setTimeout(r, 60));
    expect(getTask.mock.calls.length).toBe(callsAtTerminal);

    // 换 taskId → 状态重置并重新轮询
    rerender({ taskId: "t2" });
    await waitFor(() => expect(getTask.mock.calls.at(-1)?.[0]).toBe("t2"), { timeout: 2000 });
    // 新任务首次 tick 仍返回同一 mock 状态机末值（succeeded）
    await waitFor(() => expect(result.current?.state).toBe("succeeded"), { timeout: 2000 });
  });

  it("taskId=undefined 不轮询；卸载清理", async () => {
    const getTask = vi.fn(async (_id: string) => task({ state: "running" }));
    const { wrapper } = makeWrapper();
    const { result, unmount } = renderHook(() => useTaskPoll(undefined, getTask), { wrapper });
    expect(result.current).toBeUndefined();
    expect(getTask).not.toHaveBeenCalled();
    unmount();
    expect(getTask).not.toHaveBeenCalled();
  });
});
