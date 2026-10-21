/**
 * core/inline —— 行内编辑 changeSet（docs/core-api.md §10）。
 *
 * 职责：跨行跨单元格的脏值暂存（内存 changeSet，不进 URL）+ 批量提交/整体回滚。
 * core 不含 UI：blocks 层 data-table 的 inline 模式消费 getCell/isDirty/dirtyCount 渲染
 * 脏高亮与提交条；提交实现由宿主给（bulkUpdate 适配 / 逐行 update 聚合均可）。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { BulkResult } from "../data";

/** 单行变更：id + 该行已修改字段合集 */
export interface InlineChange<TData> {
  id: string;
  patch: Partial<TData>;
}

export interface InlineCellCtl {
  /** 当前生效值：脏值优先，否则原行值 */
  value: unknown;
  isDirty: boolean;
  set(v: unknown): void;
}

export interface UseInlineEditOptions<TData> {
  rows: TData[];
  getId: (row: TData) => string;
  /** 批量提交实现：返回 BulkResult（部分失败）或 void（全成功）；抛错 = 整体失败 */
  // biome-ignore lint/suspicious/noConfusingVoidType: core-api §10 签名（async 无返回 = void）
  commit: (changes: InlineChange<TData>[]) => Promise<BulkResult | void>;
}

export interface UseInlineEditResult<TData> {
  getCell(id: string, field: string): InlineCellCtl;
  /** 脏单元格总数（跨行求和） */
  dirtyCount: number;
  /** 按行聚合的变更集（提交载荷形态） */
  changes: InlineChange<TData>[];
  /** 提交全部脏变更；成功（或部分成功）后清空 changeSet；抛错保留供重试 */
  // biome-ignore lint/suspicious/noConfusingVoidType: 同上（spec §10）
  commit(): Promise<BulkResult | void>;
  /** 丢弃全部脏变更 */
  revert(): void;
  /** 清空 changeSet（rows 会话重置时用） */
  reset(): void;
}

const CELL_SEP = "\u0000";

function cellKey(id: string, field: string): string {
  return `${id}${CELL_SEP}${field}`;
}

/**
 * 行内编辑 changeSet：`Record<"id\u0000field", value>` 暂存脏值。
 *
 * - getCell 身份稳定；脏态经 ctl getter 惰性读（渲染期实时），set 走 setState；
 * - set 回原值 → 键被移除（changeSet 不留无差异项）；
 * - rows 变化（提交后失效刷新/翻页）：已不在行集内的脏键在 effect 内清除，
 *   翻页回来的行其未提交脏值仍在（会话内保留）；
 * - commit：只清本次快照里的键（提交期间新改的其它单元格保留）；抛错不清。
 */
export function useInlineEdit<TData>(
  opts: UseInlineEditOptions<TData>,
): UseInlineEditResult<TData> {
  const { rows, getId, commit } = opts;

  const [cellMap, setCellMap] = useState<Record<string, unknown>>({});
  const cellMapRef = useRef(cellMap);
  cellMapRef.current = cellMap;

  const rowIndex = useMemo(() => {
    const map = new Map<string, TData>();
    for (const row of rows) map.set(getId(row), row);
    return map;
  }, [rows, getId]);

  // 行集变化：清掉已不存在行的脏键（翻页离开的行不丢 —— 回来仍在；被删/被刷新掉的行不留悬空脏值）
  const knownIds = useMemo(() => new Set(rowIndex.keys()), [rowIndex]);
  useEffect(() => {
    setCellMap((prev) => {
      let changed = false;
      const next: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(prev)) {
        const id = key.slice(0, key.indexOf(CELL_SEP));
        if (knownIds.has(id)) next[key] = value;
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [knownIds]);

  const getCell = useCallback(
    (id: string, field: string): InlineCellCtl => {
      const key = cellKey(id, field);
      const row = rowIndex.get(id);
      const original = row !== undefined ? (row as Record<string, unknown>)[field] : undefined;
      return {
        get value() {
          const dirty = cellMapRef.current[key];
          return Object.hasOwn(cellMapRef.current, key) ? dirty : original;
        },
        get isDirty() {
          return Object.hasOwn(cellMapRef.current, key);
        },
        set: (v: unknown) => {
          setCellMap((prev) => {
            const next = { ...prev };
            if (v === original) delete next[key];
            else next[key] = v;
            return next;
          });
        },
      };
    },
    [rowIndex],
  );

  const changes = useMemo<InlineChange<TData>[]>(() => {
    const byRow = new Map<string, InlineChange<TData>>();
    for (const [key, value] of Object.entries(cellMap)) {
      const sep = key.indexOf(CELL_SEP);
      const id = key.slice(0, sep);
      const field = key.slice(sep + 1);
      let change = byRow.get(id);
      if (change === undefined) {
        change = { id, patch: {} };
        byRow.set(id, change);
      }
      (change.patch as Record<string, unknown>)[field] = value;
    }
    return [...byRow.values()];
  }, [cellMap]);

  const dirtyCount = useMemo(() => Object.keys(cellMap).length, [cellMap]);

  // biome-ignore lint/suspicious/noConfusingVoidType: spec §10（async 无返回 = 全成功）
  const doCommit = useCallback(async (): Promise<BulkResult | void> => {
    const snapshot = cellMapRef.current;
    const pending = changes;
    if (pending.length === 0) return undefined;
    const result = await commit(pending); // 抛错向上传（changeSet 保留供重试）
    setCellMap((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(snapshot)) delete next[key];
      return next;
    });
    return result;
  }, [changes, commit]);

  const revert = useCallback(() => setCellMap({}), []);
  const reset = useCallback(() => setCellMap({}), []);

  return { getCell, dirtyCount, changes, commit: doCommit, revert, reset };
}
