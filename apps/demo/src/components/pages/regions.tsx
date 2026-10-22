/**
 * Regions 页渲染出口（M7-A3 批1）：pages/regions.page.ts 配置驱动——
 * region→zone 树形表格（聚合 footer）+ 指标采样大列表（≥200 行自动虚拟滚动）。
 */

import { type ListColumnDef, listTableFeatures, useResourceTable } from "@patterns-ui/core/list";
import { useQuery } from "@tanstack/react-query";
import { useTable } from "@tanstack/react-table";
import { useMemo } from "react";
import { DataTable } from "@/components/blocks/list/data-table/data-table";
import { decorateColumns } from "@/components/blocks/list/resource-list-view/resource-list-view";
import { AsyncState } from "@/components/blocks/shared/async-state/async-state";
import { PageHeader } from "@/components/blocks/shared/page-header/page-header";
import type { MockMetricPoint } from "@/mocks/db";
import {
  metricsColumns,
  metricsResource,
  REGIONS_COPY,
  type RegionTreeRow,
  regionTreeColumns,
  toTreeRow,
} from "@/pages/regions.page";
import { regionsClient } from "@/resources-m4";

function RegionsTree() {
  // 树形数据静态读取（ResourceClient 直调 + useQuery；树表无 URL 查询语义）
  const query = useQuery({
    queryKey: ["regions", "list"],
    queryFn: () => regionsClient.list({ pageSize: 50 }),
    staleTime: 30_000,
  });
  const rows = useMemo(() => (query.data?.rows ?? []).map(toTreeRow), [query.data?.rows]);

  const columns = useMemo(
    () => decorateColumns([...regionTreeColumns] as ListColumnDef<RegionTreeRow>[]),
    [],
  );

  // 树形静态表：直接 useTable（getSubRows 供子行展开；无分页/URL 语义）
  const table = useTable({
    features: listTableFeatures,
    data: rows,
    columns,
    getRowId: (row: RegionTreeRow) => row.id,
    getSubRows: (row: RegionTreeRow) => (row.zones.length > 0 ? row.zones : undefined),
  });

  return (
    <AsyncState query={query} rowsEmpty={rows.length === 0} empty={REGIONS_COPY.empty}>
      <DataTable
        table={table}
        preferencesKey="regions-tree"
        tree={{
          getChildren: (row: RegionTreeRow) => (row.zones.length > 0 ? row.zones : undefined),
        }}
        aggregates={[
          { field: "services", fn: "sum" },
          { field: "loadPct", fn: "avg" },
        ]}
      />
    </AsyncState>
  );
}

function MetricsVirtual() {
  const list = useResourceTable({
    resource: metricsResource,
    mode: "client",
    clientFetchSize: 1000,
    pagination: { initialPageSize: 100, pageSizeOptions: [100, 500, 1000] },
    columns: useMemo<ListColumnDef<MockMetricPoint>[]>(
      () => decorateColumns([...metricsColumns] as ListColumnDef<MockMetricPoint>[]),
      [],
    ),
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-[13px]">
          {REGIONS_COPY.metricsSummary(list.table.getRowModel().rows.length)}
        </p>
      </div>
      <DataTable table={list.table} preferencesKey="metrics-points" virtual />
    </div>
  );
}

export function RegionsView() {
  return (
    <div className="flex flex-col gap-6 pb-6">
      <PageHeader title={REGIONS_COPY.title} description={REGIONS_COPY.description} />
      <section className="bg-card overflow-hidden rounded-xl border p-4">
        <RegionsTree />
      </section>
      <section className="bg-card overflow-hidden rounded-xl border p-4">
        <h2 className="mb-3 text-sm font-medium">{REGIONS_COPY.metricsTitle}</h2>
        <MetricsVirtual />
      </section>
    </div>
  );
}
