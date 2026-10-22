import { useTenant } from "@fleetly/patterns-ui-core/tenant";
import { createFileRoute, Link } from "@tanstack/react-router";
import { StatStrip } from "@/components/blocks/shared/stat-strip/stat-strip";
import { Button } from "@/components/ui/button";
import { servicesResource } from "@/resources";

/**
 * 租户概览：服务统计（真实计数来自 services facets）+ 状态摘要 + 常用入口。
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

  const running = bucket("status", "running");
  const degraded = bucket("status", "degraded");
  const stopped = bucket("status", "stopped");

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
            value: running,
            sub: `${stopped} 个已停止`,
            trend: running > stopped ? "up" : "down",
          },
          {
            label: "Degraded",
            value: degraded,
            sub: degraded > 0 ? "需要关注" : "一切正常",
            danger: degraded > 0,
          },
          {
            label: "Stopped",
            value: stopped,
            sub: "已停止的服务",
          },
        ]}
      />

      <section className="bg-card rounded-xl border px-5 py-4">
        <h2 className="text-sm font-medium">状态摘要</h2>
        <p className="text-muted-foreground mt-1.5 text-[13px]">
          {total === 0 ? (
            "还没有服务 —— 创建第一个服务开始部署。"
          ) : degraded > 0 ? (
            <>
              {total} 个服务中有 {degraded} 个处于降级状态，建议到{" "}
              <Link
                to="/t/$tenantId/services"
                params={{ tenantId: tenantId ?? "" }}
                search={{ status: "degraded" } as never}
                className="text-foreground underline underline-offset-2"
              >
                Services
              </Link>{" "}
              排查。
            </>
          ) : (
            <>
              全部 {total} 个服务运行正常。最近变更见{" "}
              <Link
                to="/t/$tenantId/audit"
                params={{ tenantId: tenantId ?? "" } as never}
                search={undefined as never}
                className="text-foreground underline underline-offset-2"
              >
                Audit
              </Link>
              。
            </>
          )}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
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
                params={{ tenantId: tenantId ?? "" } as never}
                search={undefined as never}
              />
            }
          >
            打开 Audit
          </Button>
        </div>
      </section>
    </div>
  );
}

export const Route = createFileRoute("/_shell/t/$tenantId/")({
  staticData: { title: "Overview" },
  component: OverviewPage,
});
