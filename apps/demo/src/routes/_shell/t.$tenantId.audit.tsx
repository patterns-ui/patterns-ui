import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_shell/t/$tenantId/audit")({
  staticData: { title: "Audit" },
  component: () => (
    <PlaceholderPage
      kind="audit"
      title="Audit"
      description="审计事件（M2 接入 cursor/load-more）"
    />
  ),
});
