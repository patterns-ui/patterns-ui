import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_shell/t/$tenantId/deployments")({
  staticData: { title: "Deployments" },
  component: () => (
    <PlaceholderPage
      kind="deployment"
      title="Deployments"
      description="部署记录与长任务（M3 接入 task）"
    />
  ),
});
