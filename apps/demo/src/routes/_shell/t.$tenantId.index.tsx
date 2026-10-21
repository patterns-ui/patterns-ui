import { useTenant } from "@fleetly/ui-component-core/tenant";
import { createFileRoute, Link } from "@tanstack/react-router";
import { StatStrip } from "@/components/blocks/shared/stat-strip/stat-strip";
import { Button } from "@/components/ui/button";
import { servicesResource } from "@/resources";

/**
 * 租户概览页：PageHeader + stat-strip（真实计数来自 services facets / audit 首页）。
 */
function OverviewPage() {
  const { tenant, tenantId, isLoading } = useTenant();
  const servicesStats = servicesResource.useList({
    page: 1,
    pageSize: 1,
    facets: ["status", "env"],
  });

  const total = servicesStats.data?.total ?? 0;
  const bucket = (field: string, value: string): number =>
    servicesStats.data?.facets
      ?.find((f) => f.field === field)
      ?.buckets.find((b) => b.value === value)?.count ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
          Overview
        </p>
        <h1 className="text-[22px] font-semibold tracking-tight">
          {tenant?.name ?? (isLoading ? "加载中…" : tenantId)}
        </h1>
        <p className="text-muted-foreground text-[13px]">
          {tenant ? ((tenant as { description?: string }).description ?? "租户概览") : "租户概览"}
        </p>
      </div>

      <StatStrip
        stats={[
          {
            label: "Services",
            value: total,
            sub: `${bucket("env", "prod")} 个生产环境`,
          },
          {
            label: "Running",
            value: bucket("status", "running"),
            sub: `${bucket("status", "degraded")} 个降级中`,
            trend: bucket("status", "running") > bucket("status", "stopped") ? "up" : "down",
          },
          {
            label: "Degraded",
            value: bucket("status", "degraded"),
            sub: bucket("status", "degraded") > 0 ? "需要关注" : "一切正常",
            danger: bucket("status", "degraded") > 0,
          },
          {
            label: "Stopped",
            value: bucket("status", "stopped"),
            sub: "已停止的服务",
          },
        ]}
      />

      <div className="flex flex-wrap items-center gap-3 rounded-xl border px-5 py-4">
        <p className="text-muted-foreground flex-1 text-[13px]">
          列表纵切（M2）已就绪：Services 页走 offset 分页 + 全套列表 blocks；Audit 页演示 cursor /
          load-more 双形态。
        </p>
        <Button
          size="sm"
          render={<Link to="/t/$tenantId/services" params={{ tenantId: tenantId ?? "" }} />}
        >
          打开 Services
        </Button>
        <Button
          size="sm"
          variant="outline"
          render={
            <Link
              to="/t/$tenantId/audit"
              params={{ tenantId: tenantId ?? "" }}
              search={{ mode: "cursor" }}
            />
          }
        >
          打开 Audit
        </Button>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_shell/t/$tenantId/")({
  staticData: { title: "Overview" },
  component: OverviewPage,
});
