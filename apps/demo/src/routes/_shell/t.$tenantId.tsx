import { useAuth } from "@fleetly/patterns-ui-core/auth";
import type { CrumbResolve } from "@fleetly/patterns-ui-core/router";
import { TenantProvider, useTenant } from "@fleetly/patterns-ui-core/tenant";
import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useCallback, useMemo, useState } from "react";
import { AppShellInset } from "@/components/blocks/shell/app-shell-inset/app-shell-inset";
import { CommandPalette } from "@/components/blocks/shell/command-palette/command-palette";
import { TopBar } from "@/components/blocks/shell/top-bar/top-bar";
import { SideNavInset } from "@/components/blocks/sidebar/side-nav-inset/side-nav-inset";
import { NotificationBell } from "@/components/notification-bell";
import { tenantNavGroups } from "@/lib/nav";
import { listTenants, resolveTenant } from "@/lib/tenants";

/**
 * 租户布局：TenantProvider（/t/$tenantId 前缀语义）+ inset 壳 + ⌘K 命令面板。
 * 顶栏只保留产品要素：搜索 / 通知 / 主题 / 账号（主题 preset 在 Settings → 外观切换）。
 */
function TenantLayout() {
  const { tenantId } = Route.useParams();
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [searchOpen, setSearchOpen] = useState(false);

  const groups = useMemo(() => tenantNavGroups(tenantId), [tenantId]);

  const commandGroups = useMemo(
    () =>
      groups.map((group) => ({
        label: group.label ?? "导航",
        items: group.items.map((item) => ({
          id: item.to,
          label: item.label,
          icon: item.icon,
          to: item.to,
        })),
      })),
    [groups],
  );

  const handleLogout = useCallback(async () => {
    await logout();
    await navigate({ to: "/auth/sign-in" });
  }, [logout, navigate]);

  const sidebar = useMemo(
    () => <SideNavInset groups={groups} user={user} onLogout={() => void handleLogout()} />,
    [groups, user, handleLogout],
  );

  return (
    <TenantProvider resolveTenant={resolveTenant} listTenants={listTenants}>
      <TenantShellChrome
        tenantId={tenantId}
        sidebar={sidebar}
        user={user}
        onLogout={() => void handleLogout()}
        searchOpen={searchOpen}
        onSearchOpenChange={setSearchOpen}
        commandGroups={commandGroups}
      />
    </TenantProvider>
  );
}

/** 面包屑的租户段反查需要 useTenant 数据（必须在 TenantProvider 内） */
function TenantShellChrome({
  tenantId,
  sidebar,
  user,
  onLogout,
  searchOpen,
  onSearchOpenChange,
  commandGroups,
}: {
  tenantId: string;
  sidebar: React.ReactNode;
  user: ReturnType<typeof useAuth>["user"];
  onLogout: () => void;
  searchOpen: boolean;
  onSearchOpenChange: (open: boolean) => void;
  commandGroups: Parameters<typeof CommandPalette>[0]["groups"];
}) {
  const { tenants } = useTenant();
  const navigate = useNavigate();
  const breadcrumbResolve = useMemo<CrumbResolve>(
    () => ({ tenant: (id) => tenants.find((t) => t.id === id)?.name }),
    [tenants],
  );

  return (
    <>
      <AppShellInset
        sidebar={sidebar}
        topbar={
          <TopBar
            onOpenSearch={() => onSearchOpenChange(true)}
            user={user ?? { name: "…", email: "" }}
            onLogout={onLogout}
            breadcrumbResolve={breadcrumbResolve}
            extra={<NotificationBell tenantId={tenantId} />}
          />
        }
      >
        <Outlet />
      </AppShellInset>
      <CommandPalette
        groups={commandGroups}
        open={searchOpen}
        onOpenChange={onSearchOpenChange}
        searchFallback={{
          label: (q) => `全站搜索「${q}」`,
          run: (q) => {
            void navigate({
              to: "/t/$tenantId/search",
              params: { tenantId },
              search: { q },
            });
          },
        }}
      />
    </>
  );
}

export const Route = createFileRoute("/_shell/t/$tenantId")({
  component: TenantLayout,
});
