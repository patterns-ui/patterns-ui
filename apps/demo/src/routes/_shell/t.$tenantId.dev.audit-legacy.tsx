/**
 * 【M7-A3 豁免清单】参照页：手写 M2 列表实现，作为库回归对照保留（产品入口是 /audit
 * 的 defineResource 装配版）——双实现对照本身是其存在目的。
 */
import type { FilterDef } from "@patterns-ui/core/filters";
import {
  createListColumnHelper,
  createListSearchSchema,
  type ListMode,
  useResourceTable,
} from "@patterns-ui/core/list";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import { z } from "zod";
import { CellEnumBadge } from "@/components/blocks/cells/cell-enum-badge/cell-enum-badge";
import { CellId } from "@/components/blocks/cells/cell-id/cell-id";
import { CellTime } from "@/components/blocks/cells/cell-time/cell-time";
import { CellUser } from "@/components/blocks/cells/cell-user/cell-user";
import {
  DataTable,
  expandColumn,
  selectionColumn,
} from "@/components/blocks/list/data-table/data-table";
import { FacetSidebar } from "@/components/blocks/list/facet-sidebar/facet-sidebar";
import { FilterBar } from "@/components/blocks/list/filter-bar/filter-bar";
import { ListPage } from "@/components/blocks/list/list-page/list-page";
import { PaginationBar } from "@/components/blocks/list/pagination-bar/pagination-bar";
import { AsyncState } from "@/components/blocks/shared/async-state/async-state";
import { Button } from "@/components/ui/button";
import type { MockAuditEvent } from "@/mocks/db";
import { auditResource, resolveUser } from "@/resources";

/**
 * 内部对照页（不进 nav / ⌘K）：手写 M2 列表实现，作为库回归对照保留。
 * 产品入口是 /audit（defineResource 装配版）。
 */

const ACTION_OPTIONS = [
  { value: "service.create", label: "service.create" },
  { value: "service.update", label: "service.update" },
  { value: "service.delete", label: "service.delete" },
  { value: "service.deploy", label: "service.deploy" },
  { value: "member.invite", label: "member.invite" },
  { value: "member.remove", label: "member.remove" },
  { value: "apikey.create", label: "apikey.create" },
  { value: "apikey.revoke", label: "apikey.revoke" },
  { value: "settings.update", label: "settings.update" },
];

const FILTER_DEFS: FilterDef[] = [
  { field: "action", label: "动作", kind: "multi-select", options: ACTION_OPTIONS },
  { field: "resource", label: "资源", kind: "text" },
  { field: "createdAt", label: "时间范围", kind: "date-range" },
];

const baseSearchSchema = createListSearchSchema({ filters: FILTER_DEFS });
const auditSearchSchema = z.object({
  ...baseSearchSchema.shape,
  mode: z.enum(["cursor", "load-more"]).catch("cursor"),
});

const helper = createListColumnHelper<MockAuditEvent>();

function AuditLegacyPage() {
  const navigate = useNavigate();
  const { tenantId } = Route.useParams();
  const mode = (Route.useSearch() as { mode?: "cursor" | "load-more" }).mode ?? "cursor";
  const listMode: ListMode = mode === "cursor" ? "server-cursor" : "load-more";

  const columns = useMemo(
    () => [
      selectionColumn(helper),
      expandColumn(helper),
      helper.accessor("id", {
        header: "事件 ID",
        cell: (info) => <CellId value={info.getValue()} chars={14} />,
      }),
      helper.accessor("action", {
        header: "动作",
        cell: (info) => (
          <CellEnumBadge
            value={info.getValue()}
            options={ACTION_OPTIONS.map((o) => ({ value: o.value, variant: "secondary" as const }))}
          />
        ),
      }),
      helper.accessor("resource", {
        header: "资源",
        cell: (info) => <span className="font-mono text-xs">{info.getValue()}</span>,
      }),
      helper.accessor("actor", {
        header: "操作者",
        cell: (info) => <CellUser id={info.getValue()} resolve={resolveUser} />,
      }),
      helper.accessor("ip", {
        header: "来源 IP",
        cell: (info) => (
          <span className="text-muted-foreground font-mono text-xs">{info.getValue()}</span>
        ),
      }),
      helper.accessor("createdAt", {
        header: "时间",
        cell: (info) => <CellTime value={info.getValue()} />,
      }),
    ],
    [],
  );

  const list = useResourceTable<MockAuditEvent>({
    resource: auditResource,
    mode: listMode,
    columns,
    filters: FILTER_DEFS,
    facets: ["action"],
    search: { fields: ["action", "resource", "actor"] },
    pagination: { pageSizeOptions: [10, 20, 50], initialPageSize: 20 },
    queryOptions: { staleTime: 10_000 },
  });

  const rowsEmpty = list.table.getRowModel().rows.length === 0;
  const hasActiveFilters = list.state.filters !== undefined || list.state.search !== "";

  return (
    <ListPage
      title="Audit（内部对照）"
      description="手写 M2 列表实现，仅作库回归对照。"
      actions={
        <>
          <Button
            variant={mode === "cursor" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              void navigate({
                search: ((prev: Record<string, unknown>) => ({
                  ...prev,
                  mode: "cursor",
                  page: undefined,
                })) as never,
              });
            }}
          >
            cursor 模式
          </Button>
          <Button
            variant={mode === "load-more" ? "default" : "outline"}
            size="sm"
            onClick={() => {
              void navigate({
                search: ((prev: Record<string, unknown>) => ({
                  ...prev,
                  mode: "load-more",
                  page: undefined,
                })) as never,
              });
            }}
          >
            load-more 模式
          </Button>
        </>
      }
      filter={
        <FilterBar
          list={list}
          defs={FILTER_DEFS}
          advanced
          onRefresh={() => void list.query.refetch()}
        />
      }
      body={
        <div className="flex gap-6">
          <FacetSidebar facetData={list.facetData} list={list} defs={FILTER_DEFS} />
          <div className="min-w-0 flex-1">
            <div className="text-muted-foreground bg-muted/30 mb-3 flex flex-wrap items-center gap-1.5 rounded-lg border border-dashed px-3.5 py-2.5 text-xs">
              <span>内部对照页：不进入导航与 ⌘K。产品版 Audit 见</span>
              <Link
                to="/t/$tenantId/audit"
                params={{ tenantId } as never}
                search={undefined as never}
                className="text-foreground underline underline-offset-2"
              >
                /audit
              </Link>
              <span>（defineResource 装配，功能等价）。</span>
            </div>
            <AsyncState
              query={list.query}
              rowsEmpty={rowsEmpty}
              hasActiveFilters={hasActiveFilters}
              onClearFilters={() => list.reset()}
              empty={{ title: "暂无审计事件", description: "时间范围内没有匹配的事件。" }}
            >
              <DataTable
                table={list.table}
                stickyFirst
                preferencesKey="audit-events-legacy"
                expandable={{
                  render: (row) => (
                    <div className="text-muted-foreground grid gap-1 text-[13px] sm:grid-cols-2">
                      <span>
                        事件：<span className="text-foreground font-medium">{row.action}</span>
                      </span>
                      <span>
                        资源：
                        <span className="text-foreground font-mono text-xs">{row.resource}</span>
                      </span>
                      <span>
                        操作者：
                        <span className="text-foreground font-medium">
                          {resolveUser(row.actor)?.name ?? row.actor}
                        </span>
                      </span>
                      <span>
                        来源 IP：<span className="text-foreground font-mono text-xs">{row.ip}</span>
                      </span>
                    </div>
                  ),
                }}
              />
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
          mode={mode === "cursor" ? "cursor" : "load-more"}
          pageSizeOptions={[10, 20, 50]}
        />
      }
      appendix={
        <p className="text-muted-foreground/80 text-xs">
          高级过滤支持 and/or 条件组（如「时间范围 AND（动作 in … OR 资源包含 …）」）；facet
          计数来自服务端 action 分布。
        </p>
      }
    />
  );
}

export const Route = createFileRoute("/_shell/t/$tenantId/dev/audit-legacy")({
  staticData: { title: "Audit（内部对照）" },
  validateSearch: auditSearchSchema,
  component: AuditLegacyPage,
});
