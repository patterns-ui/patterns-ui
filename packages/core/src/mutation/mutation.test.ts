import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleUndoable } from "./index";

describe("scheduleUndoable", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("超时后真提交", async () => {
    const optimistic = vi.fn(() => vi.fn());
    const commit = vi.fn(async () => {});
    const onToast = vi.fn();
    const { promise } = scheduleUndoable({
      optimistic,
      commit,
      durationMs: 5000,
      onToast,
    });
    expect(optimistic).toHaveBeenCalledOnce();
    expect(commit).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(5100);
    await promise;
    expect(commit).toHaveBeenCalledOnce();
    expect(onToast).toHaveBeenCalled();
  });

  it("durationMs 内撤销：还原缓存且不提交", async () => {
    const rollback = vi.fn();
    const optimistic = vi.fn(() => rollback);
    const commit = vi.fn(async () => {});
    let ctl: { undo: () => void; dismiss: () => void; secondsLeft: number } | undefined;
    const { promise } = scheduleUndoable({
      optimistic,
      commit,
      durationMs: 5000,
      onToast: (c) => {
        ctl = c;
      },
    });
    await vi.advanceTimersByTimeAsync(2000);
    expect(ctl?.secondsLeft).toBeLessThanOrEqual(5);
    ctl?.undo();
    await promise;
    expect(rollback).toHaveBeenCalledOnce();
    expect(commit).not.toHaveBeenCalled();
    // undo 后不再有 tick / 超时提交
    await vi.advanceTimersByTimeAsync(10_000);
    expect(commit).not.toHaveBeenCalled();
  });

  it("dismiss 立即提交", async () => {
    const commit = vi.fn(async () => {});
    let ctl: { undo: () => void; dismiss: () => void } | undefined;
    const { promise } = scheduleUndoable({
      optimistic: () => () => {},
      commit,
      durationMs: 8000,
      onToast: (c) => {
        ctl = c;
      },
    });
    await vi.advanceTimersByTimeAsync(1000);
    ctl?.dismiss();
    await promise;
    expect(commit).toHaveBeenCalledOnce();
  });

  it("提交失败：回滚 + reject", async () => {
    const rollback = vi.fn();
    const err = new Error("conflict");
    const commit = vi.fn(async () => {
      throw err;
    });
    let ctl: { dismiss: () => void } | undefined;
    const { promise } = scheduleUndoable({
      optimistic: () => rollback,
      commit,
      durationMs: 1000,
      onToast: (c) => {
        ctl = c;
      },
    });
    // 先挂 rejection 断言再推进时钟（避免 rejection 在 await 前成为 unhandled）
    const expectation = expect(promise).rejects.toThrow("conflict");
    await vi.advanceTimersByTimeAsync(1100);
    ctl?.dismiss(); // 已在提交中，幂等
    await expectation;
    expect(rollback).toHaveBeenCalledOnce();
  });

  it("倒计时每秒回调且 secondsLeft 递减", async () => {
    const seen: number[] = [];
    const { promise } = scheduleUndoable({
      optimistic: () => () => {},
      commit: async () => {},
      durationMs: 3000,
      onToast: (c) => {
        seen.push(c.secondsLeft);
      },
    });
    await vi.advanceTimersByTimeAsync(3200);
    await promise;
    // 首拍 3s；超时提交与最后一拍同刻时提交先到（toast 侧倒计时在 commit 时关闭即可）
    expect(seen[0]).toBe(3);
    expect(seen).toContain(1);
  });
});
