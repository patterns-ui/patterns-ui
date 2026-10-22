import { useAuth } from "@fleetly/ui-component-core/auth";
import type { HttpError } from "@fleetly/ui-component-core/data";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { SettingsPage } from "@/components/blocks/settings/settings-page/settings-page";
import { api } from "@/lib/api";
import { resolveTenant } from "@/lib/tenants";

const PRESETS = [
  { id: "default", label: "Default" },
  { id: "aurora", label: "Aurora" },
];

/**
 * 完整设置页（settings-page block）：组织[name/avatar] + 个人[display/email/时区] +
 * 安全[改密码 + 会话占位] + 外观[theme+preset]。组织/个人数据来自 mock（/api/me、/api/orgs/:id）。
 * mock 约定：改密码的「当前密码」为 demo1234；新密码 taken 之外的 8 位以上均可。
 */
function SettingsDemoPage() {
  const { tenantId } = Route.useParams();
  const { user, logout } = useAuth();
  const navigate = useNavigate();

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
    <SettingsPage
      org={org}
      onSaveOrgName={async (name) => {
        await api(`/api/orgs/${encodeURIComponent(tenantId)}`, {
          method: "PATCH",
          body: JSON.stringify({ name }),
        });
        toast.success("组织名称已更新");
      }}
      profile={{
        displayName: meQuery.data?.name ?? "",
        email: meQuery.data?.email ?? "",
      }}
      onSaveProfile={async (input) => {
        try {
          await api("/api/me", {
            method: "PATCH",
            body: JSON.stringify({
              displayName: input.displayName,
              email: input.email,
              timeZone: input.timeZone,
            }),
          });
          return { ok: true as const };
        } catch (err) {
          const http = err as HttpError;
          const fields = (http?.body as { fields?: Record<string, string> } | undefined)?.fields;
          return { ok: false as const, fieldErrors: fields, formError: http?.message };
        }
      }}
      onChangePassword={async (input) => {
        try {
          await api("/api/me/password", {
            method: "POST",
            body: JSON.stringify(input),
          });
          return { ok: true as const };
        } catch (err) {
          const http = err as HttpError;
          const fields = (http?.body as { fields?: Record<string, string> } | undefined)?.fields;
          return { ok: false as const, formError: http?.message, fieldErrors: fields };
        }
      }}
      presets={PRESETS}
      onSignOutAllSessions={async () => {
        await logout();
        await navigate({ to: "/auth/sign-in" });
      }}
    />
  );
}

export const Route = createFileRoute("/_shell/t/$tenantId/settings")({
  staticData: { title: "Settings" },
  component: SettingsDemoPage,
});
