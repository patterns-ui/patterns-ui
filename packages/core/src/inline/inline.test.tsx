// @vitest-environment happy-dom
/**
 * useInlineEdit 契约测试（docs/core-api.md §10）。
 * 覆盖：getCell 读写/脏判定、set 回原值撤销、changes 按行聚合、dirtyCount、
 * commit 成功清空 / 失败保留、revert、行集变化清悬空脏键。
 */
import { act, render } from "@testing-library/react";
import { createElement, useEffect, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { type InlineChange, useInlineEdit } from "./index";

interface Row {
  id: string;
  replicas: number;
  env: string;
}

const ROWS: Row[] = [
  { id: "d1", replicas: 2, env: "prod" },
  { id: "d2", replicas: 3, env: "dev" },
  { id: "d3", replicas: 5, env: "prod" },
];

interface Probe {
  ctl: ReturnType<typeof useInlineEdit<Row>>;
  commitCalls: InlineChange<Row>[][];
}

function harness(
  rows: Row[],
  commitImpl: (
    changes: InlineChange<Row>[],
  ) => Promise<{ succeeded: string[]; failed: { id: string; error: unknown }[] } | undefined>,
) {
  const probe: Probe = { ctl: undefined as never, commitCalls: [] };
  const host = () => {
    const ctl = useInlineEdit<Row>({
      rows,
      getId: (r) => r.id,
      commit: async (changes: InlineChange<Row>[]) => {
        probe.commitCalls.push(changes);
        return commitImpl(changes);
      },
    });
    probe.ctl = ctl;
    return null;
  };
  const rendered = render(createElement(host));
  return { probe, ...rendered };
}

describe("useInlineEdit", () => {
  it("getCell 读原值，set 后变脏并读到脏值", async () => {
    const { probe, unmount } = harness(ROWS, async () => undefined);
    await act(async () => {
      expect(probe.ctl.getCell("d1", "replicas").value).toBe(2);
      expect(probe.ctl.getCell("d1", "replicas").isDirty).toBe(false);
      probe.ctl.getCell("d1", "replicas").set(7);
    });
    expect(probe.ctl.getCell("d1", "replicas").isDirty).toBe(true);
    expect(probe.ctl.getCell("d1", "replicas").value).toBe(7);
    expect(probe.ctl.dirtyCount).toBe(1);
    unmount();
  });

  it("set 回原值 → 撤销该单元格（dirtyCount 归零）", async () => {
    const { probe, unmount } = harness(ROWS, async () => undefined);
    await act(async () => {
      probe.ctl.getCell("d2", "env").set("staging");
    });
    expect(probe.ctl.dirtyCount).toBe(1);
    await act(async () => {
      probe.ctl.getCell("d2", "env").set("dev");
    });
    expect(probe.ctl.dirtyCount).toBe(0);
    expect(probe.ctl.changes).toEqual([]);
    unmount();
  });

  it("changes 按行聚合多字段", async () => {
    const { probe, unmount } = harness(ROWS, async () => undefined);
    await act(async () => {
      probe.ctl.getCell("d1", "replicas").set(4);
      probe.ctl.getCell("d1", "env").set("dev");
      probe.ctl.getCell("d3", "replicas").set(9);
    });
    expect(probe.ctl.dirtyCount).toBe(3);
    expect(probe.ctl.changes).toEqual([
      { id: "d1", patch: { replicas: 4, env: "dev" } },
      { id: "d3", patch: { replicas: 9 } },
    ]);
    unmount();
  });

  it("commit 传变更集，成功后清空", async () => {
    const { probe, unmount } = harness(ROWS, async () => undefined);
    await act(async () => {
      probe.ctl.getCell("d1", "replicas").set(4);
    });
    await act(async () => {
      await probe.ctl.commit();
    });
    expect(probe.commitCalls).toEqual([[{ id: "d1", patch: { replicas: 4 } }]]);
    expect(probe.ctl.dirtyCount).toBe(0);
    unmount();
  });

  it("commit 抛错 → changeSet 保留供重试", async () => {
    let fail = true;
    const { probe, unmount } = harness(ROWS, async () => {
      if (fail) throw new Error("boom");
      return undefined;
    });
    await act(async () => {
      probe.ctl.getCell("d1", "replicas").set(4);
    });
    await expect(act(async () => probe.ctl.commit())).rejects.toThrow("boom");
    expect(probe.ctl.dirtyCount).toBe(1);
    fail = false;
    await act(async () => {
      await probe.ctl.commit();
    });
    expect(probe.ctl.dirtyCount).toBe(0);
    unmount();
  });

  it("revert 清空全部脏值（不经 commit）", async () => {
    const { probe, unmount } = harness(ROWS, async () => undefined);
    await act(async () => {
      probe.ctl.getCell("d1", "replicas").set(4);
      probe.ctl.getCell("d2", "env").set("staging");
      probe.ctl.revert();
    });
    expect(probe.ctl.dirtyCount).toBe(0);
    expect(probe.commitCalls).toEqual([]);
    unmount();
  });

  it("行集变化后清除悬空脏键（提交刷新/删除场景）", async () => {
    const probe: Probe = { ctl: undefined as never, commitCalls: [] };
    const impl = {
      rows: ROWS,
      commit: async (changes: InlineChange<Row>[]) => {
        probe.commitCalls.push(changes);
      },
    };
    let currentRows = ROWS;
    let bump: ((n: number) => void) | undefined;
    const host = () => {
      const [, setTick] = useState(0);
      bump = (n: number) => setTick(n);
      const ctl = useInlineEdit<Row>({
        rows: currentRows,
        getId: (r) => r.id,
        commit: impl.commit,
      });
      probe.ctl = ctl;
      // 模拟提交后行被删除 → 行集变化 + 重渲染
      useEffect(() => {
        const timer = setTimeout(() => {
          currentRows = ROWS.filter((r) => r.id !== "d1");
          bump?.(1);
        }, 50);
        return () => clearTimeout(timer);
      }, []);
      return null;
    };
    render(createElement(host));
    await act(async () => {
      probe.ctl.getCell("d1", "replicas").set(4);
      probe.ctl.getCell("d3", "env").set("dev");
    });
    expect(probe.ctl.dirtyCount).toBe(2);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 120));
    });
    // d1 已不在行集 → 其脏键被清；d3 仍在 → 保留
    expect(probe.ctl.dirtyCount).toBe(1);
    expect(probe.ctl.getCell("d3", "env").isDirty).toBe(true);
    expect(probe.ctl.getCell("d1", "replicas").isDirty).toBe(false);
  });

  it("行离开后回来：脏键已被清理，值回原值（不复活陈旧脏值）", async () => {
    const probe: Probe = { ctl: undefined as never, commitCalls: [] };
    let currentRows = ROWS;
    let bump: ((n: number) => void) | undefined;
    const host = () => {
      const [, setTick] = useState(0);
      bump = (n: number) => setTick(n);
      probe.ctl = useInlineEdit<Row>({
        rows: currentRows,
        getId: (r) => r.id,
        commit: async (changes: InlineChange<Row>[]) => {
          probe.commitCalls.push(changes);
        },
      });
      return null;
    };
    render(createElement(host));
    await act(async () => {
      probe.ctl.getCell("d2", "env").set("staging");
    });
    expect(probe.ctl.getCell("d2", "env").isDirty).toBe(true);
    // 离开（行集移除 d2）→ 脏键清理
    await act(async () => {
      currentRows = ROWS.filter((r) => r.id !== "d2");
      bump?.(1);
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(probe.ctl.getCell("d2", "env").isDirty).toBe(false);
    expect(probe.ctl.dirtyCount).toBe(0);
    // 回来（行集恢复）→ 读原值，陈旧脏值不复活
    await act(async () => {
      currentRows = ROWS;
      bump?.(2);
      await new Promise((r) => setTimeout(r, 30));
    });
    expect(probe.ctl.getCell("d2", "env").isDirty).toBe(false);
    expect(probe.ctl.getCell("d2", "env").value).toBe("dev");
    expect(probe.ctl.changes).toEqual([]);
  });

  it("commit 无脏变更时不调提交实现", async () => {
    const spy = vi.fn();
    const { probe, unmount } = harness(ROWS, spy);
    await act(async () => {
      const result = await probe.ctl.commit();
      expect(result).toBeUndefined();
    });
    expect(spy).not.toHaveBeenCalled();
    unmount();
  });
});
