import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_shell/t/$tenantId/api-keys")({
  staticData: { title: "API Keys" },
  component: () => (
    <PlaceholderPage
      kind="api-key"
      title="API Keys"
      description="API 密钥管理（M3 接入 secret-reveal）"
    />
  ),
});
