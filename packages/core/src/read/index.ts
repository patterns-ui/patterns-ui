/**
 * core/read —— read-state 元模式引擎（M7-C2 抽取自 registry/blocks/list/notification-inbox，
 * docs/paradigm.md §1.2「未读计数 / 已读状态」；docs/core-api.md §20）。
 *
 * headless：不渲染、不 import 组件，可脱离渲染测试。语义面（§1.2）：
 *  - 未读计数共享缓存：同一 name 的取数点（收件箱列表 / top-bar badge）共享同一 queryKey
 *    （core/data queryKey 工厂：[name, 'list', pageSize]）——badge 侧 staleTime 抑制重复请求；
 *  - 单条已读：client.update(id, { read: true })（PATCH 契约）；
 *  - 全部已读：markAllRead 专用端点优先，缺省回落逐条 update 扇出；
 *  - 读态翻转乐观更新：mutationMode "optimistic" 时立即翻转缓存再提交，失败回滚 + 失效
 *    （缺省 "pessimistic"：服务器确认后失效刷新——与抽取前 notification-inbox 行为一致）。
 */
import {
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { type ListParams, listKey, listKeyPrefix, type Page } from "../data";
import type { SortSpec } from "../filters";
import { defineMetaPattern, validateMetaPatternAdapter } from "../meta";

/** 读态行契约（最小面：id + read；业务字段由模式叠加，如通知的 type/title/body） */
export interface ReadStateRow {
  id: string;
  read: boolean;
}

/** read-state 适配器：list 必须；update（单条已读）与 markAllRead（全部已读端点）可选 */
export interface ReadStateClient<TRow extends ReadStateRow> {
  list(params: ListParams): Promise<Page<TRow>>;
  /** 单条已读（PATCH { read: true }）；缺省 = 无单条已读能力 */
  update?(id: string, vars: Partial<TRow>): Promise<TRow>;
  /** 全部已读专用端点（POST /read-all 之类）；缺省回落逐条 update 扇出 */
  markAllRead?(ids: string[]): Promise<unknown>;
}

const readStateAdapterShape = z
  .object({
    list: z.function(),
    update: z.function().optional(),
    markAllRead: z.function().optional(),
  })
  .loose();

/** read-state 元模式契约（contractVersion 随引擎行为演进递增，变更记入契约卡变更日志） */
export const READ_STATE = defineMetaPattern("read-state", 1, readStateAdapterShape);

/** 读态流缺省页大小（与抽取前 notification-inbox 一致） */
export const DEFAULT_READ_STATE_PAGE_SIZE = 30;
/** badge 侧缺省 staleTime（抑制与收件箱共享缓存上的重复请求；抽取前 15s） */
export const DEFAULT_UNREAD_STALE_TIME = 15_000;

export type ReadStateMutationMode = "pessimistic" | "optimistic";

export interface UseReadStateOptions<TRow extends ReadStateRow> {
  /**
   * 缓存命名空间（queryKey = [name, 'list', pageSize]）。同 name 的取数点共享缓存
   * （收件箱与 badge 必须同 name）；不同读态流（通知 / 未来的评论线程）不同 name。
   */
  name: string;
  client: ReadStateClient<TRow>;
  pageSize?: number;
  /** 缺省 [{ field: "createdAt", direction: "desc" }]（读态流的时间序契约） */
  sort?: SortSpec[];
  staleTime?: number;
  /** 读态翻转：pessimistic（缺省）/ optimistic（乐观翻转，失败回滚 + 失效） */
  mutationMode?: ReadStateMutationMode;
}

export interface ReadStateResult<TRow extends ReadStateRow> {
  query: UseQueryResult<Page<TRow>>;
  rows: TRow[];
  unreadRows: TRow[];
  unreadCount: number;
  /** 单条已读 mutation（无 update 能力 → mutationFn 报契约错误，error 落在 mutation.error） */
  markRead: UseMutationResult<TRow, Error, TRow>;
  markingAll: boolean;
  /** 全部已读（markAllRead 端点优先；无任何写能力 → 无请求直接返回） */
  markAllRead(): Promise<void>;
  /** 失效本读态流（前缀匹配：命中该 name 任意 pageSize 的查询，含 badge 查询） */
  invalidate(): Promise<void>;
}

/**
 * read-state 引擎 hook。queryFn 取数参数规范化为 { pageSize, sort }——同 name 同 pageSize
 * 的所有取数点发同一请求形状（共享缓存的前提）。dev 模式挂载时校验 client 适配器形状。
 */
export function useReadState<TRow extends ReadStateRow>(
  opts: UseReadStateOptions<TRow>,
): ReadStateResult<TRow> {
  const {
    name,
    client,
    pageSize = DEFAULT_READ_STATE_PAGE_SIZE,
    sort = [{ field: "createdAt", direction: "desc" }],
    staleTime,
    mutationMode = "pessimistic",
  } = opts;

  validateMetaPatternAdapter(READ_STATE, client, { consumer: "useReadState" });

  const queryClient = useQueryClient();
  const [markingAll, setMarkingAll] = useState(false);

  const key = listKey(name, pageSize);
  const invalidate = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: listKeyPrefix(name) });
  };

  const query = useQuery({
    queryKey: key,
    queryFn: () => client.list({ pageSize, sort }),
    ...(staleTime !== undefined ? { staleTime } : {}),
  });

  const rows = query.data?.rows ?? [];
  const unreadRows = rows.filter((row) => !row.read);

  const markRead = useMutation<TRow, Error, TRow, { prev: Page<TRow> | undefined }>({
    mutationFn: async (row: TRow) => {
      if (!client.update) {
        throw new Error(
          `read-state(${name}): client.update 缺失——单条已读需要 PATCH 能力（期望形状见引擎契约 v${READ_STATE.contractVersion}；契约卡 registry/patterns/*.contract.md）`,
        );
      }
      return client.update(row.id, { read: true } as Partial<TRow>);
    },
    ...(mutationMode === "optimistic"
      ? {
          onMutate: async (row: TRow) => {
            await queryClient.cancelQueries({ queryKey: key });
            const prev = queryClient.getQueryData<Page<TRow>>(key);
            if (prev !== undefined) {
              queryClient.setQueryData<Page<TRow>>(key, {
                ...prev,
                rows: prev.rows.map((r) => (r.id === row.id ? { ...r, read: true } : r)),
              });
            }
            return { prev };
          },
          onError: (_error, _vars, ctx) => {
            if (ctx?.prev !== undefined) queryClient.setQueryData(key, ctx.prev);
          },
          onSettled: () => {
            void invalidate();
          },
        }
      : {
          onSuccess: () => {
            void invalidate();
          },
        }),
  });

  const markAllRead = async (): Promise<void> => {
    const unreadIds = unreadRows.map((row) => row.id);
    if (unreadIds.length === 0) return;
    if (!client.markAllRead && !client.update) return; // 无写能力：无请求直接返回（preset 降级语义）
    setMarkingAll(true);
    try {
      if (client.markAllRead) {
        await client.markAllRead(unreadIds);
      } else {
        const update = client.update;
        await Promise.all(unreadIds.map((id) => update?.(id, { read: true } as Partial<TRow>)));
      }
      await invalidate();
    } finally {
      setMarkingAll(false);
    }
  };

  return {
    query,
    rows,
    unreadRows,
    unreadCount: unreadRows.length,
    markRead,
    markingAll,
    markAllRead,
    invalidate,
  };
}

/**
 * 未读数查询（top-bar badge 用；与收件箱同一 name/pageSize → 同一 queryKey 共享缓存）。
 * staleTime 缺省 15s（抑制共享缓存上的重复请求）。
 */
export function useUnreadCount<TRow extends ReadStateRow>(
  name: string,
  client: ReadStateClient<TRow>,
  opts?: { pageSize?: number; staleTime?: number; sort?: SortSpec[] },
): number {
  validateMetaPatternAdapter(READ_STATE, client, { consumer: "useUnreadCount" });
  const pageSize = opts?.pageSize ?? DEFAULT_READ_STATE_PAGE_SIZE;
  const sort = opts?.sort ?? [{ field: "createdAt", direction: "desc" }];
  const query = useQuery({
    queryKey: listKey(name, pageSize),
    queryFn: () => client.list({ pageSize, sort }),
    staleTime: opts?.staleTime ?? DEFAULT_UNREAD_STALE_TIME,
  });
  return (query.data?.rows ?? []).filter((row) => !row.read).length;
}
