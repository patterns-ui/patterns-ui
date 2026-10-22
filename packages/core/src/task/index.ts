/**
 * core/task —— task/ 与轮询刷新（docs/core-api.md §9）。
 *
 * M6-B：轮询实现统一走 react-query refetchInterval（useTaskPoll 单查询轮询、
 * useTaskSubmit 经 useQueries 支持并发任务各查各的）——定时器语义、终态停止、
 * 卸载停止全部交给 react-query observer，不再手写 setTimeout 链。
 * useNewItemsSignal：轮询发现 rows 首部新 key → 计数 + acknowledge（M2）。
 */
import { type UseQueryResult, useQueries, useQuery } from "@tanstack/react-query";
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

/** 任务轮询查询 key（单源；查询语义进 URL 的原则不适用于内存任务态） */
export function taskQueryKey(taskId: string): readonly unknown[] {
  return ["fc", "task", taskId];
}

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

/** refetchInterval 求值器：终态停止轮询，否则按 intervalMs 继续 */
function taskInterval(intervalMs: number) {
  return (query: { state: { data: TaskState | undefined } }): number | false => {
    const data = query.state.data;
    return data !== undefined && isTerminal(data.state) ? false : intervalMs;
  };
}

/**
 * 长任务提交：trigger() 拿到 { taskId } 后按 pollIntervalMs 轮询 getTask（refetchInterval），
 * 直到终态（succeeded/failed）；并发 submit 各自独立轮询；卸载即停止（resolve 最后已知状态）。
 */
export function useTaskSubmit(
  getTask: (id: string) => Promise<TaskState>,
  opts?: UseTaskSubmitOptions,
): UseTaskSubmitResult {
  const intervalMs = opts?.pollIntervalMs ?? 1500;
  const [activeIds, setActiveIds] = useState<string[]>([]);
  const getTaskRef = useRef(getTask);
  getTaskRef.current = getTask;
  const onDoneRef = useRef(opts?.onDone);
  onDoneRef.current = opts?.onDone;

  interface PendingEntry {
    resolvers: ((task: TaskState) => void)[];
    last: TaskState | undefined;
  }
  const pendingRef = useRef(new Map<string, PendingEntry>());

  // 活跃任务各一个查询（useQueries 动态数组；refetchInterval 终态自停）
  const results = useQueries({
    queries: activeIds.map((id) => ({
      queryKey: taskQueryKey(id),
      queryFn: () => getTaskRef.current(id),
      refetchInterval: taskInterval(intervalMs),
      retry: false,
    })),
  });

  // 终态 → onDone + resolve 全部等待者；卸载 → resolve 最后已知状态
  useEffect(() => {
    for (let i = 0; i < activeIds.length; i++) {
      const id = activeIds[i];
      if (id === undefined) continue;
      const entry = pendingRef.current.get(id);
      const data = results[i]?.data;
      if (!entry || data === undefined) continue;
      entry.last = data;
      if (!isTerminal(data.state)) continue;
      pendingRef.current.delete(id);
      onDoneRef.current?.(data);
      for (const resolve of entry.resolvers) resolve(data);
    }
    const stillRunning = activeIds.filter((id) => pendingRef.current.has(id));
    if (stillRunning.length !== activeIds.length) setActiveIds(stillRunning);
  }, [results, activeIds]);

  useEffect(() => {
    return () => {
      for (const [id, entry] of pendingRef.current) {
        for (const resolve of entry.resolvers) {
          resolve(entry.last ?? { id, state: "running" });
        }
      }
      pendingRef.current.clear();
    };
  }, []);

  const submit = useCallback(async (trigger: () => Promise<unknown>): Promise<TaskState> => {
    const ref = await trigger();
    const taskId = taskIdOf(ref);
    if (taskId === undefined) {
      throw new Error("useTaskSubmit: 触发响应中未找到 taskId（期望 { taskId } 形状）");
    }
    const promise = new Promise<TaskState>((resolve) => {
      const entry = pendingRef.current.get(taskId);
      if (entry) entry.resolvers.push(resolve);
      else pendingRef.current.set(taskId, { resolvers: [resolve], last: undefined });
    });
    setActiveIds((prev) => (prev.includes(taskId) ? prev : [...prev, taskId]));
    return promise;
  }, []);

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
 * 独立 taskId 轮询（useQuery + refetchInterval）：终态自动停止；taskId 变化换查询
 * （状态自然重置）；卸载 observer 移除即停止。返回 undefined = 尚未取到。
 */
export function useTaskPoll(
  taskId: string | undefined,
  getTask: (id: string) => Promise<TaskState>,
  opts?: UseTaskPollOptions,
): TaskState | undefined {
  const intervalMs = opts?.intervalMs ?? 1500;
  const enabled = opts?.enabled ?? true;
  const getTaskRef = useRef(getTask);
  getTaskRef.current = getTask;
  const onDoneRef = useRef(opts?.onDone);
  onDoneRef.current = opts?.onDone;

  const query = useQuery({
    queryKey: taskQueryKey(taskId ?? "_none_"),
    queryFn: () => getTaskRef.current(taskId as string),
    enabled: taskId !== undefined && enabled,
    refetchInterval: taskInterval(intervalMs),
    retry: false,
  });

  // 终态回调（每个 taskId 只发一次；同 id 重复到达终态不重发）
  const data = query.data;
  const firedForRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (data === undefined || !isTerminal(data.state)) return;
    if (firedForRef.current === data.id) return;
    firedForRef.current = data.id;
    onDoneRef.current?.(data);
  }, [data]);

  return data;
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
