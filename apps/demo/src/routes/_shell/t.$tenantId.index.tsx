import { useTenant } from "@fleetly/ui-component-core/tenant";
import { createFileRoute } from "@tanstack/react-router";
import { Card, CardContent } from "@/components/ui/card";

interface Stat {
  label: string;
  value: string;
  sub: string;
}

const STATS: Stat[] = [
  { label: "Services", value: "12", sub: "2 待处理变更" },
  { label: "Deployments (24h)", value: "34", sub: "成功率 99.2%" },
  { label: "Audit Events (24h)", value: "1,204", sub: "3 条告警" },
  { label: "Active API Keys", value: "3", sub: "1 个 7 天内过期" },
];

/**
 * 租户概览页：PageHeader + stat-strip（M2 block）未就绪前的占位排版
 * （card + 30px tabular-nums 大数，视觉基线见 architecture.md §8）。
 */
function OverviewPage() {
  const { tenant, tenantId, isLoading } = useTenant();

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

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {STATS.map((stat) => (
          <Card key={stat.label} className="py-5">
            <CardContent className="flex flex-col gap-1 px-5">
              <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                {stat.label}
              </p>
              <p className="text-[30px] leading-none font-semibold tabular-nums">{stat.value}</p>
              <p className="text-muted-foreground text-[13px]">{stat.sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardContent className="text-muted-foreground px-5 py-8 text-[13px]">
          列表 / 详情 / 表单资源页自 M2 起接入（defineResource 一份配置出四屏）。
        </CardContent>
      </Card>
    </div>
  );
}

export const Route = createFileRoute("/_shell/t/$tenantId/")({
  staticData: { title: "Overview" },
  component: OverviewPage,
});
