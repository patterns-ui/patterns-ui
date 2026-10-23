/**
 * audit-log —— 审计日志预设列表页（docs/blocks.md team/settings SaaS 模板；audit-log 业务模式的组装入口）。
 *
 * 行为语义自 M7-C2 起单源在 core/audit（audit-trail 元模式引擎：keyset 钉死 / append-only
 * 游标栈 / actor·action 过滤面 / 时间范围窗口 / action facet 计数）；本 block 只保留 UI 预设：
 * 列定义（cell 渲染器）+ 文案 + ListPage/FilterBar/FacetSidebar/DataTable/PaginationBar 组装。
 * 契约卡：registry/patterns/audit-log.contract.md（两层契约 + 内置决策及理由）。
 */
import { type AuditTrailEvent, useAuditTrail } from "@patterns-ui/core/audit";
import type { Resource } from "@patterns-ui/core/data";
import { createListColumnHelper, type ListColumnDef } from "@patterns-ui/core/list";
import { useMemo } from "react";
import { CellEnumBadge } from "@/components/blocks/cells/cell-enum-badge/cell-enum-badge";
import { CellId } from "@/components/blocks/cells/cell-id/cell-id";
import { CellTime } from "@/components/blocks/cells/cell-time/cell-time";
import { CellUser } from "@/components/blocks/cells/cell-user/cell-user";
import { DataTable } from "@/components/blocks/list/data-table/data-table";
import { FacetSidebar } from "@/components/blocks/list/facet-sidebar/facet-sidebar";
import { FilterBar } from "@/components/blocks/list/filter-bar/filter-bar";
import { ListPage } from "@/components/blocks/list/list-page/list-page";
import { PaginationBar } from "@/components/blocks/list/pagination-bar/pagination-bar";
import { AsyncState } from "@/components/blocks/shared/async-state/async-state";

/** 约定的审计事件行形状（core/audit 引擎契约的同名形态；保留导出名兼容既有消费方） */
export type AuditEventRow = AuditTrailEvent;

/** 过滤语义面文案（引擎字段名的本模式中文标签；④ 文案层，不进 core） */
const AUDIT_LABELS = {
  action: "动作",
  resource: "资源",
  actor: "操作者",
  createdAt: "时间范围",
} as const;

export interface AuditLogPresetProps<TData extends AuditEventRow> {
  // biome-ignore lint/suspicious/noExplicitAny: Resource<TData, any, any>（core-api 约定形态）
  resource: Resource<TData, any, any>;
  /** 动作枚举（facet chips + filter 选项） */
  actionOptions: { value: string; label: string }[];
  /** actor id → 用户（cell-user 反查） */
  resolveActor?: (id: string) => { name: string; avatarUrl?: string } | undefined;
  /** keyset 承载档：cursor 前后翻 / load-more 累计（默认 cursor） */
  mode?: "server-cursor" | "load-more";
  /** 附加列（在缺省列之后、时间列之前插入） */
  extraColumns?: ListColumnDef<TData>[];
  /** 覆盖缺省列（完全自定义） */
  columns?: ListColumnDef<TData>[];
  title?: string;
  description?: string;
  preferencesKey?: string;
}

export function AuditLogPreset<TData extends AuditEventRow>({
  resource,
  actionOptions,
  resolveActor,
  mode = "server-cursor",
  extraColumns,
  columns: columnsOverride,
  title = "Audit Log",
  description = "审计事件（keyset 分页 + 时间范围 + action facet + actor 过滤）。",
  preferencesKey = "audit-log",
}: AuditLogPresetProps<TData>) {
  const helper = createListColumnHelper<TData>();

  const columns = useMemo<ListColumnDef<TData>[]>(() => {
    if (columnsOverride) return columnsOverride;
    return [
      helper.accessor((row: TData) => row.id, {
        id: "id",
        header: "事件 ID",
        cell: (info) => <CellId value={info.getValue()} chars={14} />,
      }),
      helper.accessor((row: TData) => row.action, {
        id: "action",
        header: "动作",
        cell: (info) => (
          <CellEnumBadge
            value={info.getValue()}
            options={actionOptions.map((o) => ({ value: o.value, variant: "secondary" as const }))}
          />
        ),
      }),
      helper.accessor((row: TData) => row.resource, {
        id: "resource",
        header: "资源",
        cell: (info) => <span className="font-mono text-xs">{info.getValue()}</span>,
      }),
      ...(extraColumns ?? []),
      helper.accessor((row: TData) => row.actor, {
        id: "actor",
        header: "操作者",
        cell: (info) => <CellUser id={info.getValue()} resolve={resolveActor as never} />,
      }),
      helper.accessor((row: TData) => row.createdAt, {
        id: "createdAt",
        header: "时间",
        cell: (info) => <CellTime value={info.getValue()} />,
      }),
    ];
  }, [columnsOverride, extraColumns, actionOptions, resolveActor]);

  const trail = useAuditTrail<TData>({
    resource,
    columns,
    actionOptions,
    shape: mode === "load-more" ? "load-more" : "paged",
    labels: AUDIT_LABELS,
    pagination: { pageSizeOptions: [10, 20, 50], initialPageSize: 20 },
    queryOptions: { staleTime: 10_000 },
  });
  const list = trail.list;

  const rowsEmpty = list.table.getRowModel().rows.length === 0;
  const hasActiveFilters = list.state.filters !== undefined || list.state.search !== "";

  return (
    <ListPage
      title={title}
      description={description}
      filter={
        <FilterBar
          list={list}
          defs={trail.defs}
          advanced
          onRefresh={() => void list.query.refetch()}
        />
      }
      body={
        <div className="flex gap-6">
          <FacetSidebar facetData={list.facetData} list={list} defs={trail.defs} />
          <div className="min-w-0 flex-1">
            <AsyncState
              query={list.query}
              rowsEmpty={rowsEmpty}
              hasActiveFilters={hasActiveFilters}
              onClearFilters={() => list.reset()}
              empty={{ title: "暂无审计事件", description: "时间范围内没有匹配的事件。" }}
            >
              <DataTable table={list.table} stickyFirst preferencesKey={preferencesKey} />
            </AsyncState>
          </div>
        </div>
      }
      pagination={
        <PaginationBar
          list={{
            ...list,
            hasNextPage: trail.hasNextPage,
          }}
          mode={trail.mode === "load-more" ? "load-more" : "cursor"}
          pageSizeOptions={[10, 20, 50]}
        />
      }
    />
  );
}
