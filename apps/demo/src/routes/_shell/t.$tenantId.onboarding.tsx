/**
 * onboarding 路由（M7-A3 批2 薄胶水）：结构在 pages/onboarding.page.ts（definePage wizard，
 * onboarding 预设宿主）；创建资源/邀请/完成适配器在此注入。
 * 首登向导：欢迎 → 创建首个资源 → 邀请成员 → 完成跳转（步骤间数据保留由 block 内部流承载）。
 */
import { PageRenderer } from "@patterns-ui/core/page";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  ONBOARDING_ENV_OPTIONS,
  ONBOARDING_ROLE_OPTIONS,
  onboardingPageConfig,
} from "@/pages/onboarding.page";
import { wizardTable } from "@/pages/tables";
import { servicesResource } from "@/resources";
import { teamClient } from "@/resources-m4";

function OnboardingPage() {
  const navigate = useNavigate();
  const { tenantId } = Route.useParams();

  return (
    <div className="mx-auto w-full max-w-2xl py-8">
      <PageRenderer
        page={onboardingPageConfig}
        table={wizardTable}
        data={{
          host: {
            defaultTeamName: "Acme Web",
            envOptions: [...ONBOARDING_ENV_OPTIONS],
            roleOptions: [...ONBOARDING_ROLE_OPTIONS],
            onCreateResource: async (input: { name: string; env: string }) => {
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
            },
            onInviteMembers: async (invites: readonly { email: string; role: string }[]) => {
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
            },
            onComplete: async (payload: { teamName: string; invites: unknown[] }) => {
              toast.success(`初始化完成：${payload.teamName}（${payload.invites.length} 个邀请）`);
              await navigate({ to: "/t/$tenantId", params: { tenantId } });
            },
          },
        }}
      />
    </div>
  );
}

export const Route = createFileRoute("/_shell/t/$tenantId/onboarding")({
  staticData: { title: "Onboarding" },
  component: OnboardingPage,
});
