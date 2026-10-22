/**
 * Regions 页配置（M7-A3 批1）：树形表列（声明式 meta.cell）+ 虚拟化指标 resource +
 * 行形状变换适配器 —— 纯配置（0 JSX）。渲染出口 components/pages/regions.tsx。
 */
import { createResource } from "@patterns-ui/core/data";
import type { MockRegion } from "@/mocks/db";
import { metricsClient } from "@/resources-m4";

export const REGIONS_COPY = {
  title: "Regions",
  description: "各区域与可用区的服务分布、负载与健康状态。",
  metricsTitle: "指标采样",
  metricsSummary: (count: number) => `最近 1000 条指标采样，当前显示 ${count} 条。`,
  empty: { title: "没有区域数据" },
} as const;

/** region → zone 树形统一行形状 */
export interface RegionTreeRow {
  id: string;
  name: string;
  kind: "region" | "zone";
  provider?: string;
  services: number;
  loadPct: number;
  status: "healthy" | "degraded" | "offline";
  zones: RegionTreeRow[];
}

export function toTreeRow(region: MockRegion): RegionTreeRow {
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

export const REGION_STATUS_MAP = {
  healthy: "success",
  degraded: "warning",
  offline: "danger",
} as const;

/** 树形表列（声明式：名称列的层级强调由 data-table 树形模式承担） */
export const regionTreeColumns = [
  { accessorKey: "name", header: "名称" },
  {
    accessorKey: "services",
    header: "服务数",
    meta: { cell: "number", cellOptions: { format: "int" } },
  },
  { accessorKey: "loadPct", header: "负载", meta: { cell: "number", cellOptions: { unit: "%" } } },
  {
    accessorKey: "status",
    header: "状态",
    meta: { cell: "status", cellOptions: { map: REGION_STATUS_MAP, pulseFor: ["healthy"] } },
  },
] as const;

/** 指标采样列（虚拟化大列表） */
export const metricsColumns = [
  { accessorKey: "id", header: "点号", meta: { cell: "id" } },
  { accessorKey: "ts", header: "时间", meta: { cell: "time" } },
  { accessorKey: "cpuPct", header: "CPU", meta: { cell: "number", cellOptions: { unit: "%" } } },
  { accessorKey: "memPct", header: "内存", meta: { cell: "number", cellOptions: { unit: "%" } } },
  {
    accessorKey: "reqPerSec",
    header: "req/s",
    meta: { cell: "number", cellOptions: { format: "int" } },
  },
  {
    accessorKey: "errRate",
    header: "错误率",
    meta: { cell: "number", cellOptions: { format: "percent" } },
  },
] as const;

/** 模块级 resource（hooks 身份稳定；pageSize 提到 1000 整取） */
export const metricsResource = createResource({
  name: "metrics-points",
  tenantScoped: true,
  client: {
    list: async (params: { pageSize?: number }) =>
      metricsClient.list({ ...params, pageSize: 1000 }),
    get: async (id: string) => {
      const page = await metricsClient.list({ pageSize: 1000 });
      const row = page.rows.find((r) => r.id === id);
      if (!row) throw new Error("not found");
      return row;
    },
  },
});
