/**
 * core/task —— task/ 与轮询刷新（docs/core-api.md §9）。
 *
 * M2 落地 useNewItemsSignal（轮询发现 rows 首部新 key → 计数 + acknowledge）。
 * useTaskSubmit / useTaskPoll 留待 M3（长任务状态机 mock 就绪时一起实现）。
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
