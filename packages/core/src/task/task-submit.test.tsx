// @vitest-environment happy-dom
/**
 * useTaskSubmit / useTaskPoll 契约测试（docs/core-api.md §9）：
 * 触发→轮询→终态回调；useTaskPoll 终态停止轮询；卸载清理；taskId 提取。
 */
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { isTerminal, type TaskState, taskIdOf, useTaskPoll, useTaskSubmit } from "./index";

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
  it("触发→轮询→终态返回 + onDone 回调", async () => {
    const states: TaskState["state"][] = ["queued", "running", "succeeded"];
    let call = 0;
    const getTask = vi.fn(async (): Promise<TaskState> => {
      const state = states[Math.min(call, states.length - 1)];
      call += 1;
      return task({ state, progress: Math.min(call * 40, 100) });
    });
    const onDone = vi.fn();
    const { result } = renderHook(() => useTaskSubmit(getTask, { pollIntervalMs: 10, onDone }));

    let final: TaskState | undefined;
    await act(async () => {
      final = await result.current.submit(async () => ({ taskId: "t1" }));
    });
    expect(final?.state).toBe("succeeded");
    expect(getTask.mock.calls.length).toBe(3);
    expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ state: "succeeded" }));
  });

  it("触发响应缺 taskId → 抛错", async () => {
    const { result } = renderHook(() => useTaskSubmit(vi.fn(), { pollIntervalMs: 10 }));
    await expect(
      act(async () => {
        await result.current.submit(async () => ({ nope: 1 }));
      }),
    ).rejects.toThrow("taskId");
  });
});

describe("useTaskPoll", () => {
  it("轮询至终态停止（不再发请求）；taskId 变化重置", async () => {
    vi.useFakeTimers();
    try {
      const states: TaskState["state"][] = ["queued", "running", "running", "succeeded"];
      let call = 0;
      const getTask = vi.fn(async (_id: string): Promise<TaskState> => {
        const state = states[Math.min(call, states.length - 1)];
        call += 1;
        return task({ state });
      });
      const onDone = vi.fn();
      const { result, rerender } = renderHook(
        ({ taskId }: { taskId: string | undefined }) =>
          useTaskPoll(taskId, getTask, { intervalMs: 5, onDone }),
        { initialProps: { taskId: "t1" as string | undefined } },
      );
      // 首次 tick 立即发出
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current?.state).toBe("queued");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5);
      });
      expect(result.current?.state).toBe("running");
      await act(async () => {
        await vi.advanceTimersByTimeAsync(10);
      });
      expect(result.current?.state).toBe("succeeded");
      const callsAtTerminal = getTask.mock.calls.length;
      expect(onDone).toHaveBeenCalledWith(expect.objectContaining({ state: "succeeded" }));

      // 终态后继续推进时间 → 不再请求
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50);
      });
      expect(getTask.mock.calls.length).toBe(callsAtTerminal);

      // 换 taskId → 状态重置并重新轮询
      rerender({ taskId: "t2" });
      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current?.state).toBe("succeeded"); // 新任务首次 tick 仍返回同一 mock 状态机末值
      expect(getTask.mock.calls.at(-1)?.[0]).toBe("t2");
    } finally {
      vi.useRealTimers();
    }
  });

  it("taskId=undefined 不轮询；卸载清理定时器", async () => {
    const getTask = vi.fn(async (_id: string) => task({ state: "running" }));
    const { result, unmount } = renderHook(() => useTaskPoll(undefined, getTask));
    expect(result.current).toBeUndefined();
    expect(getTask).not.toHaveBeenCalled();
    unmount();
    expect(getTask).not.toHaveBeenCalled();
  });
});
