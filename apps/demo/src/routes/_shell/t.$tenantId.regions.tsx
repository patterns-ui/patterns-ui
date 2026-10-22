import { createResource } from "@patterns-ui/core/data";
import {
  createListColumnHelper,
  type ListColumnDef,
  listTableFeatures,
  useResourceTable,
} from "@patterns-ui/core/list";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useTable } from "@tanstack/react-table";
import { useMemo } from "react";
import { CellNumber } from "@/components/blocks/cells/cell-number/cell-number";
import { CellStatus } from "@/components/blocks/cells/cell-status/cell-status";
import { CellTime } from "@/components/blocks/cells/cell-time/cell-time";
import { DataTable } from "@/components/blocks/list/data-table/data-table";
import { AsyncState } from "@/components/blocks/shared/async-state/async-state";
import { PageHeader } from "@/components/blocks/shared/page-header/page-header";
import type { MockMetricPoint, MockRegion } from "@/mocks/db";
import { metricsClient, regionsClient } from "@/resources-m4";

/**
 * Regions 页：region→zone 树形表格 + 聚合 footer + 指标采样大列表（≥200 行自动虚拟滚动）。
 */

// ---------------------------------------------------------------------------
// 树形：region（父行）→ zone（子行）统一行形状
// ---------------------------------------------------------------------------

interface RegionTreeRow {
  id: string;
  name: string;
  kind: "region" | "zone";
  provider?: string;
  services: number;
  loadPct: number;
  status: "healthy" | "degraded" | "offline";
  zones: RegionTreeRow[];
}

function toTreeRow(region: MockRegion): RegionTreeRow {
  return {
    id: region.id,
    name: region.name,
    kind: "region",
    provider: region.provider,
    services: region.zones.reduce((n, z) => n + z.services, 0),
    loadPct: Math.round(region.zones.reduce((n, z) => n + z.loadPct, 0) / region.zones.length),
    status: region.zones.some((z) => z.status === "offline")
      ? "offline"
      : region.zones.some((z) => z.status === "degraded")
        ? "degraded"
        : "healthy",
    zones: region.zones.map((zone) => ({
      id: zone.id,
      name: zone.name,
      kind: "zone",
      services: zone.services,
      loadPct: zone.loadPct,
      status: zone.status,
      zones: [],
    })),
  };
}

const treeHelper = createListColumnHelper<RegionTreeRow>();

const STATUS_MAP = {
  healthy: "success",
  degraded: "warning",
  offline: "danger",
} as const;

function RegionsTree() {
  // 树形数据静态读取（ResourceClient 直调 + useQuery；树表无 URL 查询语义）
  const query = useQuery({
    queryKey: ["regions", "list"],
    queryFn: () => regionsClient.list({ pageSize: 50 }),
    staleTime: 30_000,
  });
  const rows = useMemo(() => (query.data?.rows ?? []).map(toTreeRow), [query.data?.rows]);

  const columns = useMemo<ListColumnDef<RegionTreeRow>[]>(
    () => [
      treeHelper.accessor("name", {
        header: "名称",
        cell: (info) => (
          <span className={info.row.original.kind === "region" ? "font-medium" : undefined}>
            {info.getValue()}
            {info.row.original.provider ? (
              <span className="text-muted-foreground ml-2 text-xs">
                {info.row.original.provider}
              </span>
            ) : null}
          </span>
        ),
      }),
      treeHelper.accessor("services", {
        header: "服务数",
        cell: (info) => <CellNumber value={info.getValue()} format="int" />,
      }),
      treeHelper.accessor("loadPct", {
        header: "负载",
        cell: (info) => <CellNumber value={info.getValue()} unit="%" />,
      }),
      treeHelper.accessor("status", {
        header: "状态",
        cell: (info) => (
          <CellStatus value={info.getValue()} map={STATUS_MAP} pulseFor={["healthy"]} />
        ),
      }),
    ],
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
    <AsyncState query={query} rowsEmpty={rows.length === 0} empty={{ title: "没有区域数据" }}>
      <DataTable
        table={table}
        preferencesKey="regions-tree"
        tree={{ getChildren: (row) => (row.zones.length > 0 ? row.zones : undefined) }}
        aggregates={[
          { field: "services", fn: "sum" },
          { field: "loadPct", fn: "avg" },
        ]}
      />
    </AsyncState>
  );
}

// ---------------------------------------------------------------------------
// 虚拟化：1000 行 metrics（client 模式整取 + virtual 自动启用）
// ---------------------------------------------------------------------------

const metricsHelper = createListColumnHelper<MockMetricPoint>();

/** 模块级 resource（hooks 身份稳定；pageSize 提到 1000 整取） */
const metricsResource = createResource<
  MockMetricPoint,
  Partial<MockMetricPoint>,
  Partial<MockMetricPoint>
>({
  name: "metrics-points",
  tenantScoped: true,
  client: {
    list: async (params) => metricsClient.list({ ...params, pageSize: 1000 }),
    get: async (id: string) => {
      const page = await metricsClient.list({ pageSize: 1000 });
      const row = page.rows.find((r) => r.id === id);
      if (!row) throw new Error("not found");
      return row;
    },
  },
});

function MetricsVirtual() {
  const list = useResourceTable<MockMetricPoint>({
    resource: metricsResource,
    mode: "client",
    clientFetchSize: 1000,
    pagination: { initialPageSize: 100, pageSizeOptions: [100, 500, 1000] },
    columns: useMemo<ListColumnDef<MockMetricPoint>[]>(
      () => [
        metricsHelper.accessor("id", {
          header: "点号",
          cell: (i) => <span className="font-mono text-xs">{i.getValue()}</span>,
        }),
        metricsHelper.accessor("ts", {
          header: "时间",
          cell: (i) => <CellTime value={i.getValue()} />,
        }),
        metricsHelper.accessor("cpuPct", {
          header: "CPU",
          cell: (i) => <CellNumber value={i.getValue()} unit="%" />,
        }),
        metricsHelper.accessor("memPct", {
          header: "内存",
          cell: (i) => <CellNumber value={i.getValue()} unit="%" />,
        }),
        metricsHelper.accessor("reqPerSec", {
          header: "req/s",
          cell: (i) => <CellNumber value={i.getValue()} format="int" />,
        }),
        metricsHelper.accessor("errRate", {
          header: "错误率",
          cell: (i) => <CellNumber value={i.getValue()} format="percent" />,
        }),
      ],
      [],
    ),
  });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="text-muted-foreground text-[13px]">
          最近 1000 条指标采样，当前显示 {list.table.getRowModel().rows.length} 条。
        </p>
      </div>
      <DataTable table={list.table} preferencesKey="metrics-points" virtual />
    </div>
  );
}

// ---------------------------------------------------------------------------
// 页面
// ---------------------------------------------------------------------------

function RegionsPage() {
  return (
    <div className="flex flex-col gap-6 pb-6">
      <PageHeader title="Regions" description="各区域与可用区的服务分布、负载与健康状态。" />
      <section className="bg-card overflow-hidden rounded-xl border p-4">
        <RegionsTree />
      </section>
      <section className="bg-card overflow-hidden rounded-xl border p-4">
        <h2 className="mb-3 text-sm font-medium">指标采样</h2>
        <MetricsVirtual />
      </section>
    </div>
  );
}

export const Route = createFileRoute("/_shell/t/$tenantId/regions")({
  staticData: { title: "Regions" },
  component: RegionsPage,
});
