import type { FilterDef } from "@fleetly/ui-component-core/filters";
import {
  createListColumnHelper,
  createListSearchSchema,
  useResourceTable,
} from "@fleetly/ui-component-core/list";
import { useNewItemsSignal } from "@fleetly/ui-component-core/task";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { CellEnumBadge } from "@/components/blocks/cells/cell-enum-badge/cell-enum-badge";
import { CellId } from "@/components/blocks/cells/cell-id/cell-id";
import { CellNumber } from "@/components/blocks/cells/cell-number/cell-number";
import { CellStatus } from "@/components/blocks/cells/cell-status/cell-status";
import { CellTime } from "@/components/blocks/cells/cell-time/cell-time";
import { CellUser } from "@/components/blocks/cells/cell-user/cell-user";
import {
  actionsColumn,
  DataTable,
  selectionColumn,
} from "@/components/blocks/list/data-table/data-table";
import { ExportButton } from "@/components/blocks/list/export-button/export-button";
import { FilterBar } from "@/components/blocks/list/filter-bar/filter-bar";
import { ListPage } from "@/components/blocks/list/list-page/list-page";
import { NewItemsBanner } from "@/components/blocks/list/new-items-banner/new-items-banner";
import { PaginationBar } from "@/components/blocks/list/pagination-bar/pagination-bar";
import { RefreshBar } from "@/components/blocks/list/refresh-bar/refresh-bar";
import { SelectionBar } from "@/components/blocks/list/selection-bar/selection-bar";
import { useResourceMutations } from "@/components/blocks/list/use-resource-mutations/use-resource-mutations";
import { AsyncState } from "@/components/blocks/shared/async-state/async-state";
import { Button } from "@/components/ui/button";
import { fetchAllForExport } from "@/lib/clients";
import type { MockService } from "@/mocks/db";
import { resolveUser, servicesResource } from "@/resources";

const ENV_OPTIONS = [
  { value: "rep", label: "rep" },
  { value: "staging", label: "staging" },
  { value: "prod", label: "prod" },
];

const STATUS_OPTIONS = [
  { value: "running", label: "running" },
  { value: "degraded", label: "degraded" },
  { value: "stopped", label: "stopped" },
];

const FILTER_DEFS: FilterDef[] = [
  { field: "status", label: "状态", kind: "multi-select", options: STATUS_OPTIONS },
  { field: "env", label: "环境", kind: "select", options: ENV_OPTIONS },
  { field: "replicas", label: "副本数", kind: "number" },
  {
    field: "region",
    label: "区域",
    kind: "select",
    options: [
      { value: "cn-beijing", label: "cn-beijing" },
      { value: "cn-shanghai", label: "cn-shanghai" },
      { value: "cn-hangzhou", label: "cn-hangzhou" },
      { value: "ap-southeast-1", label: "ap-southeast-1" },
      { value: "us-west-2", label: "us-west-2" },
    ],
  },
  { field: "createdAt", label: "创建时间", kind: "date-range" },
];

const helper = createListColumnHelper<MockService>();

function ServicesPage() {
  const [autoIntervalMs, setAutoIntervalMs] = useState<number | false>(false);
  const { tenantId } = Route.useParams();

  const { useDeleteWithUndo, useBulkDeleteWithUndo } = useResourceMutations(servicesResource);
  const deleteRow = useDeleteWithUndo();
  const bulkDelete = useBulkDeleteWithUndo();
  const updateRow = servicesResource.useUpdate({
    mutationMode: "optimistic",
    onSuccess: () => toast.success("已更新（乐观变更）"),
  });

  const rowActions = (row: MockService) => [
    {
      label: "标记为 running",
      run: () => updateRow.mutate({ id: row.id, status: "running", version: String(row.version) }),
    },
    {
      label: "复制 ID",
      run: () => {
        void navigator.clipboard?.writeText(row.id);
        toast.success("ID 已复制");
      },
      separatorBefore: true,
    },
    {
      label: "删除（可撤销）",
      danger: true,
      run: () => deleteRow.mutate({ id: row.id }),
      separatorBefore: true,
    },
  ];

  const columns = useMemo(
    () => [
      selectionColumn(helper),
      helper.accessor("id", {
        header: "ID",
        cell: (info) => <CellId value={info.getValue()} chars={11} />,
      }),
      helper.accessor("name", { header: "名称", cell: (info) => info.getValue() }),
      helper.accessor("env", {
        header: "环境",
        cell: (info) => (
          <CellEnumBadge
            value={info.getValue()}
            options={[
              { value: "rep", variant: "outline" },
              { value: "staging", variant: "secondary" },
              { value: "prod", variant: "default" },
            ]}
          />
        ),
      }),
      helper.accessor("status", {
        header: "状态",
        cell: (info) => <CellStatus value={info.getValue()} pulseFor={["running"]} />,
      }),
      helper.accessor("replicas", {
        header: "副本",
        cell: (info) => <CellNumber value={info.getValue()} unit="个" />,
      }),
      helper.accessor("region", { header: "区域" }),
      helper.accessor("owner", {
        header: "负责人",
        cell: (info) => <CellUser id={info.getValue()} resolve={resolveUser} />,
      }),
      helper.accessor("updatedAt", {
        header: "更新时间",
        cell: (info) => <CellTime value={info.getValue()} />,
      }),
      actionsColumn(helper, rowActions),
    ],
    [rowActions, updateRow],
  );

  const list = useResourceTable<MockService>({
    resource: servicesResource,
    mode: "server-offset",
    columns,
    filters: FILTER_DEFS,
    facets: ["env", "status"],
    search: { fields: ["name", "id"] },
    sort: { initial: [{ field: "name", direction: "asc" }], multi: true },
    queryOptions: { staleTime: 15_000, refetchInterval: autoIntervalMs },
  });

  const signal = useNewItemsSignal(list.query, { key: (row) => (row as MockService).id });

  const selectedIds = useMemo(
    () => Object.keys(list.table.state.rowSelection),
    [list.table.state.rowSelection],
  );

  const clearSelection = () => list.table.setRowSelection({});

  // `/` 聚焦搜索（页面接线；data-table 本身只处理 Enter 打开行操作）
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "/" || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }
      const input = document.querySelector<HTMLInputElement>('[data-slot="filter-bar-search"]');
      if (input) {
        event.preventDefault();
        input.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const rowsEmpty = list.table.getRowModel().rows.length === 0;
  const hasActiveFilters = list.state.filters !== undefined || list.state.search !== "";

  return (
    <ListPage
      title="Services"
      description="服务的完整列表纵切演示：URL 事实源（过滤/排序/分页/搜索）· 多列排序 · 命名视图 · 批量与 undoable 删除 · CSV 导出 · 轮询新数据。"
      actions={
        <>
          <RefreshBar
            query={list.query}
            autoIntervalMs={autoIntervalMs}
            onAutoIntervalChange={setAutoIntervalMs}
          />
          <ExportButton<MockService>
            fetch={() =>
              fetchAllForExport(servicesResource.client, {
                pageSize: 100,
                filters: list.effectiveFilters,
                sort:
                  list.state.sort.length > 0
                    ? list.state.sort
                    : [{ field: "name", direction: "asc" }],
                search: list.state.search !== "" ? list.state.search : undefined,
              })
            }
            columns={[
              { key: "id", header: "ID" },
              { key: "name", header: "名称" },
              { key: "env", header: "环境" },
              { key: "status", header: "状态" },
              { key: "replicas", header: "副本" },
              { key: "region", header: "区域" },
              { key: "owner", header: "负责人" },
              { key: "createdAt", header: "创建时间" },
              { key: "updatedAt", header: "更新时间" },
              { key: "version", header: "版本" },
            ]}
            filename="services"
          />
          <Button render={<Link to="/t/$tenantId/services/new" params={{ tenantId }} />}>
            <Plus /> 新建服务
          </Button>
        </>
      }
      filter={
        <FilterBar
          list={list}
          defs={FILTER_DEFS}
          savedViewsResourceKey="services"
          onRefresh={() => void list.query.refetch()}
        />
      }
      toolbar={
        <>
          <NewItemsBanner signal={signal} />
          <SelectionBar
            count={selectedIds.length}
            onClear={clearSelection}
            actions={[
              {
                label: "批量删除",
                danger: true,
                confirm: "批量删除",
                run: async () => {
                  await bulkDelete.mutateAsync({ ids: selectedIds });
                  clearSelection();
                },
              },
              {
                label: `批量重启（${selectedIds.length}）`,
                confirm: "批量重启",
                run: () => {
                  toast.info(`演示：对 ${selectedIds.length} 个服务执行重启（M3 接长任务）`);
                },
              },
            ]}
          />
        </>
      }
      body={
        <AsyncState
          query={list.query}
          rowsEmpty={rowsEmpty}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={() => list.reset()}
          empty={{ title: "还没有服务", description: "创建第一个服务后它会出现在这里。" }}
        >
          <DataTable table={list.table} stickyFirst stickyLast preferencesKey="services" />
        </AsyncState>
      }
      pagination={
        <PaginationBar
          list={{ ...list, hasNextPage: undefined }}
          mode="offset"
          pageSizeOptions={[10, 20, 50, 100]}
        />
      }
      appendix={
        <p className="text-muted-foreground/80 text-xs">
          提示：URL 即事实源 ——
          过滤/排序/页码变化会写入地址栏，复制链接即可还原；命名视图保存的就是当前查询串。
          搜索「boom」可触发 500 错误态。
        </p>
      }
    />
  );
}

const searchSchema = createListSearchSchema({ filters: FILTER_DEFS });

export const Route = createFileRoute("/_shell/t/$tenantId/services/")({
  staticData: { title: "Services" },
  validateSearch: searchSchema,
  component: ServicesPage,
});
