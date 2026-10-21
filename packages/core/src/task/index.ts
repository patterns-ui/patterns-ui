/**
 * core/task —— task/ 与轮询刷新（docs/core-api.md §9）。
 *
 * useNewItemsSignal：轮询发现 rows 首部新 key → 计数 + acknowledge（M2）。
 * useTaskSubmit / useTaskPoll：长任务「触发→轮询→终态」状态机（M3）。
 */
import type { UseQueryResult } from "@tanstack/react-query";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Page } from "../data";

export interface TaskState {
  id: string;
  state: "queued" | "running" | "succeeded" | "failed";
  progress?: number;
  error?: string;
}

export type TaskTerminalState = "succeeded" | "failed";

/** 终态判定（succeeded / failed） */
export function isTerminal(state: TaskState["state"]): state is TaskTerminalState {
  return state === "succeeded" || state === "failed";
}

/** 从触发响应提取 taskId：{ taskId } / { id } / { task: { id } } / 字符串本体 */
export function taskIdOf(ref: unknown): string | undefined {
  if (typeof ref === "string") return ref;
  if (ref === null || typeof ref !== "object") return undefined;
  const record = ref as { taskId?: unknown; id?: unknown; task?: unknown };
  if (typeof record.taskId === "string") return record.taskId;
  if (typeof record.id === "string") return record.id;
  if (record.task !== null && typeof record.task === "object") {
    const inner = record.task as { id?: unknown };
    if (typeof inner.id === "string") return inner.id;
  }
  return undefined;
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export interface UseTaskSubmitOptions {
  /** 轮询间隔，默认 1500ms */
  pollIntervalMs?: number;
  /** 到达终态（succeeded/failed）时回调 */
  onDone?: (task: TaskState) => void;
}

export interface UseTaskSubmitResult {
  /** 触发 → 轮询 → 返回终态 TaskState；组件卸载后停止轮询并返回最后一次观察值 */
  submit(trigger: () => Promise<unknown>): Promise<TaskState>;
}

/**
 * 长任务提交：trigger() 拿到 { taskId } 后按 pollIntervalMs 轮询 getTask，
 * 直到终态（succeeded/failed）；卸载即停止（返回最后已知状态）。
 */
export function useTaskSubmit(
  getTask: (id: string) => Promise<TaskState>,
  opts?: UseTaskSubmitOptions,
): UseTaskSubmitResult {
  const intervalMs = opts?.pollIntervalMs ?? 1500;
  const getTaskRef = useRef(getTask);
  getTaskRef.current = getTask;
  const onDoneRef = useRef(opts?.onDone);
  onDoneRef.current = opts?.onDone;
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const submit = useCallback(
    async (trigger: () => Promise<unknown>): Promise<TaskState> => {
      const ref = await trigger();
      const taskId = taskIdOf(ref);
      if (taskId === undefined) {
        throw new Error("useTaskSubmit: 触发响应中未找到 taskId（期望 { taskId } 形状）");
      }
      for (;;) {
        const task = await getTaskRef.current(taskId);
        if (isTerminal(task.state)) {
          onDoneRef.current?.(task);
          return task;
        }
        if (!aliveRef.current) return task;
        await sleep(intervalMs);
        if (!aliveRef.current) return task;
      }
    },
    [intervalMs],
  );

  return { submit };
}

export interface UseTaskPollOptions {
  /** 轮询间隔，默认 1500ms */
  intervalMs?: number;
  /** 轮询开关（缺省 true）；taskId 为空时天然不轮询 */
  enabled?: boolean;
  /** 终态回调 */
  onDone?: (task: TaskState) => void;
}

/**
 * 独立 taskId 轮询：每次 tick 取一次状态；终态停止；组件卸载清理定时器。
 * 传入新 taskId 时重置。返回 undefined = 尚未取到。
 */
export function useTaskPoll(
  taskId: string | undefined,
  getTask: (id: string) => Promise<TaskState>,
  opts?: UseTaskPollOptions,
): TaskState | undefined {
  const intervalMs = opts?.intervalMs ?? 1500;
  const enabled = opts?.enabled ?? true;
  const [task, setTask] = useState<TaskState | undefined>(undefined);
  const getTaskRef = useRef(getTask);
  getTaskRef.current = getTask;
  const onDoneRef = useRef(opts?.onDone);
  onDoneRef.current = opts?.onDone;

  // taskId 变化时清空上一任务状态
  useEffect(() => {
    setTask(undefined);
  }, []);

  useEffect(() => {
    if (taskId === undefined || !enabled) return;
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async (): Promise<void> => {
      try {
        const next = await getTaskRef.current(taskId);
        if (!alive) return;
        setTask(next);
        if (isTerminal(next.state)) {
          onDoneRef.current?.(next);
          return; // 终态停止
        }
      } catch {
        // 单次失败静默（下一 tick 重试；调用方可经 refetchInterval 式监督）
      }
      if (alive) timer = setTimeout(tick, intervalMs);
    };
    void tick();
    return () => {
      alive = false;
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [taskId, enabled, intervalMs]);

  return task;
}

export interface UseNewItemsSignalOptions<TRow> {
  /** 默认 row.id */
  key?: (row: TRow) => string;
}

export interface NewItemsSignal {
  /** 未确认的新数据条数 */
  newCount: number;
  /** 确认：清零 + refetch（新行随刷新进入表格；不自动插行防跳动） */
  acknowledge(): void;
}

/**
 * 轮询刷新发现 rows 中未见过的新 key → 累计计数；已见 key 记入基线防重复计数；
 * acknowledge = refetch + 清零。数据变化仅发生在 refetch 之后（配合 refetchInterval 轮询）。
 */
export function useNewItemsSignal<TRow = Record<string, unknown>>(
  query: UseQueryResult<Page<TRow>>,
  opts?: UseNewItemsSignalOptions<TRow>,
): NewItemsSignal {
  const keyOf: (row: TRow) => string =
    opts?.key ?? ((row) => String((row as Record<string, unknown>)?.id ?? ""));
  const knownKeys = useRef<Set<string>>(new Set());
  const primed = useRef(false);
  const [newCount, setNewCount] = useState(0);

  const rows = query.data?.rows;

  useEffect(() => {
    if (rows === undefined) return;
    let fresh = 0;
    for (const row of rows) {
      const key = String(keyOf(row) ?? "");
      if (key === "") continue;
      if (!knownKeys.current.has(key)) {
        knownKeys.current.add(key);
        if (primed.current) fresh += 1;
      }
    }
    primed.current = true;
    if (fresh > 0) setNewCount((n) => n + fresh);
  }, [rows, keyOf]);

  const acknowledge = useCallback(() => {
    setNewCount(0);
    void query.refetch();
  }, [query]);

  return { newCount, acknowledge };
}
