import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Onboarding } from "@/components/blocks/auth/onboarding/onboarding";
import { servicesResource } from "@/resources";
import { teamClient } from "@/resources-m4";

/** 首登向导演示：欢迎 → 创建首个资源 → 邀请成员 → 完成跳转（步骤间数据保留） */
function OnboardingPage() {
  const navigate = useNavigate();
  const { tenantId } = Route.useParams();

  return (
    <div className="mx-auto w-full max-w-2xl py-8">
      <Onboarding
        defaultTeamName="Acme Web"
        envOptions={[
          { value: "rep", label: "rep（演示）" },
          { value: "staging", label: "staging" },
          { value: "prod", label: "prod" },
        ]}
        roleOptions={[
          { value: "admin", label: "Admin" },
          { value: "member", label: "Member" },
          { value: "viewer", label: "Viewer" },
        ]}
        onCreateResource={async (input) => {
          try {
            await servicesResource.client.create?.({
              name: input.name,
              env: input.env as never,
            } as never);
            return undefined;
          } catch (err) {
            const message =
              (err as { body?: { fields?: Record<string, string> } })?.body?.fields?.name ??
              (err instanceof Error ? err.message : "创建失败");
            return message;
          }
        }}
        onInviteMembers={async (invites) => {
          for (const invite of invites) {
            try {
              await teamClient.createInvitation({
                email: invite.email,
                role: invite.role as never,
              });
            } catch (err) {
              const message =
                (err as { body?: { fields?: Record<string, string> } })?.body?.fields?.email ??
                (err instanceof Error ? err.message : "邀请失败");
              return `${invite.email}：${message}`;
            }
          }
          return undefined;
        }}
        onComplete={async (payload) => {
          toast.success(`初始化完成：${payload.teamName}（${payload.invites.length} 个邀请）`);
          await navigate({ to: "/t/$tenantId", params: { tenantId } });
        }}
      />
    </div>
  );
}

export const Route = createFileRoute("/_shell/t/$tenantId/onboarding")({
  staticData: { title: "Onboarding" },
  component: OnboardingPage,
});
