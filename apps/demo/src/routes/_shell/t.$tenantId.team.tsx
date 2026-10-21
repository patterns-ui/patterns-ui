import { createFileRoute } from "@tanstack/react-router";
import { PlaceholderPage } from "@/components/placeholder-page";

export const Route = createFileRoute("/_shell/t/$tenantId/team")({
  staticData: { title: "Team" },
  component: () => (
    <PlaceholderPage kind="team" title="Team" description="成员与邀请（M4 接入 team-page）" />
  ),
});
