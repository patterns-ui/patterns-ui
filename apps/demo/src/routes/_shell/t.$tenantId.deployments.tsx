import { createFileRoute, Link } from "@tanstack/react-router";
import { Rocket } from "lucide-react";
import { EmptyState } from "@/components/blocks/shared/empty-state/empty-state";
import { PageHeader } from "@/components/blocks/shared/page-header/page-header";
import { Button } from "@/components/ui/button";

function DeploymentsPage() {
  const { tenantId } = Route.useParams();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Deployments" description="服务的发布记录与进度。" />
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
