/**
 * 租户概览渲染出口（M7-A3 批2）：pages/overview.page.ts 配置驱动——
 * PageHeader（租户名，运行时）+ stat-strip（definePage overview，facets 计数经
 * PageRenderer data 注入）+ 状态摘要卡。dashboard-page 宿主 M8 波1 落地后
 * 本视图收敛为工厂装配（届时摘要区进宿主 activity 槽）。
 */
import { PageRenderer } from "@patterns-ui/core/page";
import { useTenant } from "@patterns-ui/core/tenant";
import { Link } from "@tanstack/react-router";
import { PageHeader } from "@/components/blocks/shared/page-header/page-header";
import { Button } from "@/components/ui/button";
import { OVERVIEW_COPY, overviewPageConfig } from "@/pages/overview.page";
import { overviewTable } from "@/pages/tables";
import { servicesResource } from "@/resources";

export function OverviewView() {
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
  const prod = bucket("env", "prod");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={OVERVIEW_COPY.eyebrow}
        title={tenant?.name ?? (isLoading ? OVERVIEW_COPY.loadingTitle : (tenantId ?? ""))}
        description={
          tenant
            ? ((tenant as { description?: string }).description ?? OVERVIEW_COPY.defaultDescription)
            : OVERVIEW_COPY.defaultDescription
        }
      />

      <PageRenderer
        page={overviewPageConfig}
        table={overviewTable}
        data={{
          host: {
            stats: [
              { label: "Services", value: total, sub: `${prod} 个生产环境` },
              {
                label: "Running",
                value: running,
                sub: `${stopped} 个已停止`,
                trend: running > stopped ? ("up" as const) : ("down" as const),
              },
              {
                label: "Degraded",
                value: degraded,
                sub: degraded > 0 ? "需要关注" : "一切正常",
                danger: degraded > 0,
              },
              { label: "Stopped", value: stopped, sub: "已停止的服务" },
            ],
          },
        }}
      />

      <section className="bg-card rounded-xl border px-5 py-4">
        <h2 className="text-sm font-medium">{OVERVIEW_COPY.summaryTitle}</h2>
        <p className="text-muted-foreground mt-1.5 text-[13px]">
          {total === 0 ? (
            OVERVIEW_COPY.summaryEmpty
          ) : degraded > 0 ? (
            <>
              {OVERVIEW_COPY.summaryDegradedPrefix(total, degraded)}{" "}
              <Link
                to="/t/$tenantId/services"
                params={{ tenantId: tenantId ?? "" }}
                search={{ status: "degraded" } as never}
                className="text-foreground underline underline-offset-2"
              >
                {OVERVIEW_COPY.servicesLink}
              </Link>{" "}
              {OVERVIEW_COPY.summaryDegradedSuffix}
            </>
          ) : (
            <>
              {OVERVIEW_COPY.summaryHealthyPrefix(total)}{" "}
              <Link
                to="/t/$tenantId/audit"
                params={{ tenantId: tenantId ?? "" } as never}
                search={undefined as never}
                className="text-foreground underline underline-offset-2"
              >
                {OVERVIEW_COPY.auditLink}
              </Link>
              {OVERVIEW_COPY.summaryHealthySuffix}
            </>
          )}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            render={<Link to="/t/$tenantId/services" params={{ tenantId: tenantId ?? "" }} />}
          >
            {OVERVIEW_COPY.openServices}
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
            {OVERVIEW_COPY.openAudit}
          </Button>
        </div>
      </section>
    </div>
  );
}
