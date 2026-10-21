import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_shell/t/$tenantId/services")({
  staticData: { title: "Services" },
  component: () => (
    <PlaceholderPage
      kind="service"
      title="Services"
      description="服务列表页（M2 接入 data-table）"
    />
  ),
});
