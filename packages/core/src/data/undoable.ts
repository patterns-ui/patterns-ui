/**
 * data/undoable —— undoable 提交时序（docs/core-api.md §6）。
 *
 * M6-B 归位：scheduleUndoable 从 mutation 模块下沉为 data 内部实现
 * （data 不得反向 import mutation —— paradigm.md §2.1 依赖方向）。
 * mutation 子路径（@patterns-ui/core/mutation）保留为兼容 re-export（blocks
 * use-resource-mutations 消费其类型）。
 *
 * 时序约定：
 *   t0        立即应用乐观变更（optimistic() 返回回滚函数）
 *   t0..T     onToast 每秒回调（secondsLeft 递减）；undo() → 回滚 + 结束（不提交）；
 *             dismiss() → 视为用户已确认，立即提交
 *   t0+T      超时真提交（commit()）
 *   提交失败   回滚 + promise reject（错误向上抛给 mutation 调用方）
 */
export interface UndoableToastControl {
  undo: () => void;
  dismiss: () => void;
  secondsLeft: number;
}

export interface UndoableJob {
  /** 应用乐观变更，返回回滚函数 */
  optimistic: () => () => void;
  commit: () => Promise<void>;
  durationMs: number;
  onToast: (ctl: UndoableToastControl) => void;
}

export interface ScheduleUndoable {
  /** 正常路径：undo → 立即 resolve；提交成功 → resolve；提交失败 → reject */
  promise: Promise<void>;
}

export function scheduleUndoable(job: UndoableJob): ScheduleUndoable {
  let rollback: (() => void) | undefined;
  let finished = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let ticker: ReturnType<typeof setInterval> | undefined;
  let notify: ((ctl: UndoableToastControl) => void) | undefined;

  const cleanup = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    if (ticker !== undefined) clearInterval(ticker);
    timer = undefined;
    ticker = undefined;
    notify = undefined;
  };

  const promise = new Promise<void>((resolve, reject) => {
    const settle = (err?: unknown): void => {
      if (finished) return;
      finished = true;
      cleanup();
      if (err !== undefined) reject(err);
      else resolve();
    };

    const doCommit = (): void => {
      if (finished) return;
      cleanup();
      job
        .commit()
        .then(() => settle())
        .catch((err: unknown) => {
          rollback?.();
          settle(err);
        });
    };

    function doUndo(): void {
      if (finished) return;
      rollback?.();
      settle();
    }

    rollback = job.optimistic();

    notify = (ctl) => job.onToast(ctl);
    let secondsLeft = Math.max(1, Math.ceil(job.durationMs / 1000));
    notify({ undo: doUndo, dismiss: doCommit, secondsLeft });

    ticker = setInterval(() => {
      if (finished) return;
      secondsLeft = Math.max(0, secondsLeft - 1);
      notify?.({ undo: doUndo, dismiss: doCommit, secondsLeft });
    }, 1000);

    timer = setTimeout(() => doCommit(), job.durationMs);
  });

  return { promise };
}
