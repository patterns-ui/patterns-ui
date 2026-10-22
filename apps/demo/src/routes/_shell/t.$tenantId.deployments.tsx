import { createFileRoute, Link } from "@tanstack/react-router";
import { Rocket } from "lucide-react";
import { EmptyState } from "@/components/blocks/shared/empty-state/empty-state";
import { Button } from "@/components/ui/button";

function DeploymentsPage() {
  const { tenantId } = Route.useParams();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px] font-semibold tracking-tight">Deployments</h1>
        <p className="text-muted-foreground text-[13px]">服务的发布记录与进度。</p>
      </div>
      <EmptyState
        icon={Rocket}
        title="还没有部署记录"
        description="部署从服务详情触发 —— 打开一个服务，点击「部署」开始第一次发布。"
        action={
          <Button size="sm" render={<Link to="/t/$tenantId/services" params={{ tenantId }} />}>
            打开 Services
          </Button>
        }
      />
    </div>
  );
}

export const Route = createFileRoute("/_shell/t/$tenantId/deployments")({
  staticData: { title: "Deployments" },
  component: DeploymentsPage,
});
