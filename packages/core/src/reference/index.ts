/**
 * core/reference —— 关联数据（docs/core-api.md §4）。
 *
 * useReference：ids 去重 → 优先 client.getMany → 否则 list+in 过滤分块（每块 50）兜底。
 * queryKey 约定：[name, tenantId?, 'many', idsSorted]。
 */
import { type UseQueryResult, useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getManyViaList, type Resource } from "../data";
import { useTenantOptional } from "../tenant";

export interface UseReferenceResult<TData> {
  /** id → 记录（未命中为 undefined） */
  data: Record<string, TData | undefined>;
  isLoading: boolean;
}

/**
 * 批量解析外键引用。ids 去重 + 排序后作为 queryKey 的一部分（同 ids 多处调用共享一次请求）。
 * client.getMany 优先；缺省走 list + in 过滤分块（每块 50，getManyViaList）。
 */
export function useReference<TData>(
  resource: Resource<TData, any, any>,
  ids: string[],
): UseReferenceResult<TData> {
  const tenantId = useTenantOptional()?.tenantId;
  const scope = resource.tenantScoped ? tenantId : undefined;
  const uniqueSorted = useMemo(() => [...new Set(ids)].sort(), [ids]);
  const key = useMemo(
    () => [
      ...(resource.tenantScoped ? [resource.name, scope] : [resource.name]),
      "many",
      uniqueSorted,
    ],
    [resource.name, resource.tenantScoped, scope, uniqueSorted],
  );

  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<TData[]> => {
      if (uniqueSorted.length === 0) return [];
      if (resource.client.getMany) return resource.client.getMany(uniqueSorted);
      return getManyViaList(resource.client, uniqueSorted, resource.getId);
    },
    enabled: uniqueSorted.length > 0,
    staleTime: 60_000,
  });

  const data = useMemo(() => {
    const map: Record<string, TData | undefined> = {};
    for (const id of ids) map[id] = undefined;
    for (const row of query.data ?? []) {
      map[resource.getId(row)] = row;
    }
    return map;
  }, [ids, query.data, resource]);

  return { data, isLoading: query.isPending && uniqueSorted.length > 0 };
}

/** 默认 label：row.name ?? row.title ?? row.id（空串视为缺失，逐级回落） */
export function defaultReferenceLabel(row: Record<string, unknown>): string {
  for (const key of ["name", "title", "id"] as const) {
    const value = row?.[key];
    if (typeof value === "string" && value !== "") return value;
    if (typeof value === "number") return String(value);
  }
  return "";
}

export interface UseReferenceLabelResult<TData = unknown> {
  /** id → label（未解析/未命中为 undefined） */
  labels: Record<string, string>;
  /** id → 记录（自定义 render 需要完整行时使用） */
  data: Record<string, TData | undefined>;
  isLoading: boolean;
}

/** label 解析（blocks reference-field / cell-user 引用态消费） */
export function useReferenceLabel<TData>(
  resource: Resource<TData, any, any>,
  ids: string[],
  getIdLabel?: (row: TData) => string,
): UseReferenceLabelResult {
  const { data, isLoading } = useReference(resource, ids);
  const labels = useMemo(() => {
    const out: Record<string, string> = {};
    for (const [id, row] of Object.entries(data)) {
      if (row === undefined) continue;
      out[id] = getIdLabel
        ? getIdLabel(row)
        : defaultReferenceLabel(row as unknown as Record<string, unknown>);
    }
    return out;
  }, [data, getIdLabel]);
  return { labels, data, isLoading };
}

/** blocks 层 ReferenceSelect 的 core 约定（形态见 docs/core-api.md §4） */
export interface ReferenceSelectProps {
  resource: Resource<any, any, any>;
  value: string | string[] | undefined;
  onChange(v: string | string[]): void;
  multiple?: boolean;
  /** 默认 name contains */
  searchToFilter?: (q: string) => unknown;
  enableAfterChars?: number;
  initialPageSize?: number;
  allowCreate?: { render: (props: { onCreated: (id: string) => void }) => React.ReactNode };
  placeholder?: string;
}

export type { UseQueryResult };
