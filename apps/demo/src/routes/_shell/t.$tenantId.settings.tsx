/**
 * Settings 路由（M7-A3 批2 薄胶水）：结构在 pages/settings.page.ts（definePage settings），
 * 数据与保存适配器（mock 接线、409/422 回填）在此注入 PageRenderer data。
 * mock 约定：改密码的「当前密码」为 demo1234；新密码 taken 之外的 8 位以上均可。
 */
import { useAuth } from "@patterns-ui/core/auth";
import type { HttpError } from "@patterns-ui/core/data";
import { PageRenderer } from "@patterns-ui/core/page";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { resolveTenant } from "@/lib/tenants";
import { settingsPageConfig } from "@/pages/settings.page";
import { settingsTable } from "@/pages/tables";

const PRESETS = [
  { id: "default", label: "Default" },
  { id: "aurora", label: "Aurora" },
];

function SettingsDemoPage() {
  const { tenantId } = Route.useParams();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const meQuery = useQuery({
    queryKey: ["me"],
    queryFn: () =>
      api<{ id: string; name: string; email: string }>("/api/me").catch(() => ({
        id: "",
        name: user?.name ?? "",
        email: user?.email ?? "",
      })),
    initialData: user ? { id: user.id, name: user.name, email: user.email } : undefined,
  });

  const orgQuery = useQuery({
    queryKey: ["org", tenantId],
    queryFn: () => resolveTenant(tenantId),
  });

  const org = orgQuery.data
    ? { name: orgQuery.data.name, avatarUrl: orgQuery.data.avatarUrl, plan: orgQuery.data.plan }
    : undefined;

  return (
    <PageRenderer
      page={settingsPageConfig}
      table={settingsTable}
      data={{
        host: {
          org,
          onSaveOrgName: async (name: string) => {
            await api(`/api/orgs/${encodeURIComponent(tenantId)}`, {
              method: "PATCH",
              body: JSON.stringify({ name }),
            });
            toast.success("组织名称已更新");
          },
          profile: {
            displayName: meQuery.data?.name ?? "",
            email: meQuery.data?.email ?? "",
          },
          onSaveProfile: async (input: {
            displayName: string;
            email: string;
            timeZone?: string;
          }) => {
            try {
              await api("/api/me", {
                method: "PATCH",
                body: JSON.stringify({
                  displayName: input.displayName,
                  email: input.email,
                  timeZone: input.timeZone,
                }),
              });
              // 个人资料缓存归本路由所有：保存成功后失效（block 不感知宿主 queryKey）
              void queryClient.invalidateQueries({ queryKey: ["me"] });
              return { ok: true as const };
            } catch (err) {
              const http = err as HttpError;
              const fields = (http?.body as { fields?: Record<string, string> } | undefined)
                ?.fields;
              return { ok: false as const, fieldErrors: fields, formError: http?.message };
            }
          },
          onChangePassword: async (input: { currentPassword: string; newPassword: string }) => {
            try {
              await api("/api/me/password", {
                method: "POST",
                body: JSON.stringify(input),
              });
              return { ok: true as const };
            } catch (err) {
              const http = err as HttpError;
              const fields = (http?.body as { fields?: Record<string, string> } | undefined)
                ?.fields;
              return {
                ok: false as const,
                formError: http?.message,
                fieldErrors: fields,
              };
            }
          },
          presets: PRESETS,
          onSignOutAllSessions: async () => {
            await logout();
            await navigate({ to: "/auth/sign-in" });
          },
        },
      }}
    />
  );
}

export const Route = createFileRoute("/_shell/t/$tenantId/settings")({
  staticData: { title: "Settings" },
  component: SettingsDemoPage,
});
