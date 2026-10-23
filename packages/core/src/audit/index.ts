/**
 * core/audit —— audit-trail 元模式引擎（M7-C2 抽取自 registry/blocks/list/audit-log，
 * docs/paradigm.md §1.2「append 日志 / keyset / actor·action」；docs/core-api.md §19）。
 *
 * headless：不渲染、不 import 组件，可脱离渲染测试。组合 list-browse 引擎
 * （useResourceTable 的 server-cursor / load-more 两档——keyset 协议派生，append-only
 * 游标栈、筛选必重置等跨协议不变量由 list 引擎承载），本引擎钉死协议选择为 keyset
 * （append 日志 offset 漂移不可接受，业务决策见 registry/patterns/audit-log.contract.md）
 * 并叠加审计领域语义：actor·action 字段形状、时间范围窗口（createdAt date-range）、
 * action facet 计数、搜索面（action/resource/actor）。
 */

import { useMemo } from "react";
import { z } from "zod";
import type { Resource } from "../data";
import type { FilterDef } from "../filters";
import {
  type ListColumnDef,
  type ListMode,
  type PaginationCapabilities,
  paginationCapabilitiesOf,
  type ResourceTableResult,
  useResourceTable,
} from "../list";
import { defineMetaPattern, validateMetaPatternAdapter } from "../meta";

/** 审计事件行契约（actor·action 字段形状——元模式层只钉行为字段，业务列由模式叠加） */
export interface AuditTrailEvent {
  id: string;
  /** 动作名（facet 计数与过滤的锚点字段；枚举由 actionOptions 提供） */
  action: string;
  /** 被作用资源标识 */
  resource: string;
  /** 操作者 id（展示侧经 reference-resolution 反查，引擎不做展示假设） */
  actor: string;
  /** 事件时间（ISO；时间范围窗口的锚点字段） */
  createdAt: string;
  ip?: string;
}

/**
 * audit-trail 适配器 = Resource（list 面契约：cursor + filters[时间范围/action in/actor] +
 * facets[action] + search）。形状校验只查结构（name/useList/client.list 存在）；
 * 端点对参数的兑现是消费端契约（契约卡钉死）。
 */
const auditTrailAdapterShape = z
  .object({
    name: z.string(),
    useList: z.function(),
    client: z.object({ list: z.function() }).loose(),
  })
  .loose();

/** audit-trail 元模式契约（contractVersion 随引擎行为演进递增，变更记入契约卡变更日志） */
export const AUDIT_TRAIL = defineMetaPattern("audit-trail", 1, auditTrailAdapterShape);

/** keyset 的 URL 承载档（与 core-api §3.1 的 DefListPagination.shape 同义） */
export type AuditTrailShape = "paged" | "load-more";

/** 过滤语义面的标签（文案属 ④ 应用层：block 注入，缺省回落字段名） */
export interface AuditTrailLabels {
  action: string;
  resource: string;
  actor: string;
  createdAt: string;
}

/** 审计过滤语义：action facet 多选 / resource 文本 / actor 文本 / createdAt 时间范围窗口 */
export function auditTrailFilterDefs(
  actionOptions: readonly { value: string; label: string }[],
  labels?: Partial<AuditTrailLabels>,
): FilterDef[] {
  const l: AuditTrailLabels = {
    action: "action",
    resource: "resource",
    actor: "actor",
    createdAt: "createdAt",
    ...labels,
  };
  return [
    { field: "action", label: l.action, kind: "multi-select", options: [...actionOptions] },
    { field: "resource", label: l.resource, kind: "text" },
    { field: "actor", label: l.actor, kind: "text" },
    { field: "createdAt", label: l.createdAt, kind: "date-range" },
  ];
}

export interface UseAuditTrailOptions<TData extends AuditTrailEvent> {
  // biome-ignore lint/suspicious/noExplicitAny: Resource<TData, any, any>（core-api 约定形态）
  resource: Resource<TData, any, any>;
  /** 列定义透传 list-browse 引擎（cell 渲染器是 UI，留在模式/block 层） */
  columns: ListColumnDef<TData>[];
  /** 动作枚举（action facet/过滤选项） */
  actionOptions: readonly { value: string; label: string }[];
  /** keyset 承载档：paged（cursor 前后翻，缺省）/ load-more（累计拼接） */
  shape?: AuditTrailShape;
  /** 过滤语义面标签（文案注入；缺省回落字段名） */
  labels?: Partial<AuditTrailLabels>;
  /** 搜索面（缺省 action/resource/actor） */
  searchFields?: string[];
  pagination?: { initialPageSize?: number; pageSizeOptions?: number[] };
  queryOptions?: { staleTime?: number; refetchInterval?: number | false };
  /** 默认 true；false 时状态留在内存（嵌入/测试场景，与 useResourceTable 同语义） */
  syncWithLocation?: boolean;
}

export interface AuditTrailResult<TData extends AuditTrailEvent> {
  /** list-browse 引擎产物（keyset：server-cursor | load-more；恒非 page/offset 家族） */
  list: ResourceTableResult<TData>;
  /** 审计过滤语义面（FilterBar/FacetSidebar 消费） */
  defs: FilterDef[];
  /** 引擎 ListMode（keyset 派生；pagination-bar 消费方据此选形态） */
  mode: ListMode;
  /** 协议派生 UI 能力（keyset：无 canJump、无 total、token 留内存） */
  capabilities: PaginationCapabilities;
  /** load-more 恒真（可继续累计）；paged = 服务端还有下一页（nextCursor 存在） */
  hasNextPage: boolean;
}

/**
 * audit-trail 引擎 hook：协议钉死 keyset（无 page/offset 选项——业务决策单源在契约卡），
 * 组装审计过滤语义面并驱动 list-browse 引擎取数。dev 模式挂载时校验 resource 适配器形状。
 */
export function useAuditTrail<TData extends AuditTrailEvent>(
  opts: UseAuditTrailOptions<TData>,
): AuditTrailResult<TData> {
  const {
    resource,
    columns,
    actionOptions,
    shape = "paged",
    labels,
    searchFields = ["action", "resource", "actor"],
    pagination,
    queryOptions,
    syncWithLocation,
  } = opts;

  validateMetaPatternAdapter(AUDIT_TRAIL, resource, { consumer: "useAuditTrail" });

  const defs = useMemo(() => auditTrailFilterDefs(actionOptions, labels), [actionOptions, labels]);
  const mode: ListMode = shape === "load-more" ? "load-more" : "server-cursor";

  const list = useResourceTable<TData>({
    resource,
    mode,
    columns,
    filters: defs,
    facets: ["action"],
    search: { fields: searchFields },
    ...(syncWithLocation !== undefined ? { syncWithLocation } : {}),
    ...(pagination ? { pagination } : {}),
    ...(queryOptions ? { queryOptions } : {}),
  });

  return {
    list,
    defs,
    mode,
    capabilities: paginationCapabilitiesOf(mode),
    hasNextPage: shape === "load-more" || list.query.data?.nextCursor !== undefined,
  };
}
