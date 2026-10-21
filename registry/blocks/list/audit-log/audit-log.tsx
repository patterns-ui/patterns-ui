/**
 * audit-log —— 审计日志预设列表页（docs/blocks.md team/settings SaaS 模板）。
 *
 * 组装 preset：useResourceTable（server-cursor / load-more 双模式）+ FilterBar（时间范围 +
 * action facet + actor 文本）+ FacetSidebar（action chips 计数）+ DataTable + PaginationBar。
 * 列定义内置（id/action/resource/actor/createdAt）；actor 经 resolve 反查展示。
 */
import type { Resource } from "@fleetly/ui-component-core/data";
import {
  createListColumnHelper,
  type ListColumnDef,
  useResourceTable,
} from "@fleetly/ui-component-core/list";
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

/** 约定的审计事件行形状（缺省列定义读取这些字段） */
export interface AuditEventRow {
  id: string;
  action: string;
  resource: string;
  actor: string;
  ip?: string;
  createdAt: string;
}

export interface AuditLogPresetProps<TData extends AuditEventRow> {
  // biome-ignore lint/suspicious/noExplicitAny: Resource<TData, any, any>（core-api 约定形态）
  resource: Resource<TData, any, any>;
  /** 动作枚举（facet chips + filter 选项） */
  actionOptions: { value: string; label: string }[];
  /** actor id → 用户（cell-user 反查） */
  resolveActor?: (id: string) => { name: string; avatarUrl?: string } | undefined;
  /** keyset 形态：cursor 前后翻 / load-more 累计（默认 cursor） */
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

  const defs = useMemo(
    () => [
      {
        field: "action",
        label: "动作",
        kind: "multi-select" as const,
        options: actionOptions,
      },
      { field: "resource", label: "资源", kind: "text" as const },
      { field: "actor", label: "操作者", kind: "text" as const },
      { field: "createdAt", label: "时间范围", kind: "date-range" as const },
    ],
    [actionOptions],
  );

  const list = useResourceTable<TData>({
    resource,
    mode,
    columns,
    filters: defs,
    facets: ["action"],
    search: { fields: ["action", "resource", "actor"] },
    pagination: { pageSizeOptions: [10, 20, 50], initialPageSize: 20 },
    queryOptions: { staleTime: 10_000 },
  });

  const rowsEmpty = list.table.getRowModel().rows.length === 0;
  const hasActiveFilters = list.state.filters !== undefined || list.state.search !== "";

  return (
    <ListPage
      title={title}
      description={description}
      filter={
        <FilterBar list={list} defs={defs} advanced onRefresh={() => void list.query.refetch()} />
      }
      body={
        <div className="flex gap-6">
          <FacetSidebar facetData={list.facetData} list={list} defs={defs} />
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
            hasNextPage: list.query.data?.nextCursor !== undefined || mode === "load-more",
          }}
          mode={mode === "server-cursor" ? "cursor" : "load-more"}
          pageSizeOptions={[10, 20, 50]}
        />
      }
    />
  );
}
