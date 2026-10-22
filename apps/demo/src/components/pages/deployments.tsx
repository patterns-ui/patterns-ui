/** Deployments 渲染出口（M7-A3 批1）：pages/deployments.page.ts 配置驱动（空态指针页）。 */
import { Link, useParams } from "@tanstack/react-router";
import { Rocket } from "lucide-react";
import { EmptyState } from "@/components/blocks/shared/empty-state/empty-state";
import { PageHeader } from "@/components/blocks/shared/page-header/page-header";
import { Button } from "@/components/ui/button";
import { DEPLOYMENTS_COPY } from "@/pages/deployments.page";

export function DeploymentsView() {
  const { tenantId } = useParams({ from: "/_shell/t/$tenantId/deployments" });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={DEPLOYMENTS_COPY.title} description={DEPLOYMENTS_COPY.description} />
      <EmptyState
        icon={Rocket}
        title={DEPLOYMENTS_COPY.empty.title}
        description={DEPLOYMENTS_COPY.empty.description}
        action={
          <Button size="sm" render={<Link to="/t/$tenantId/services" params={{ tenantId }} />}>
            {DEPLOYMENTS_COPY.empty.actionLabel}
          </Button>
        }
      />
    </div>
  );
}
