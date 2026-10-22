import { useAuth } from "@fleetly/patterns-ui-core/auth";
import { useTenant } from "@fleetly/patterns-ui-core/tenant";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { z } from "zod";
import { CopyButton } from "@/components/blocks/shared/copy-button/copy-button";
import { EmptyState } from "@/components/blocks/shared/empty-state/empty-state";
import { ErrorState } from "@/components/blocks/shared/error-state/error-state";
import { ResourceIcon } from "@/components/blocks/shared/resource-icon/resource-icon";
import { StatusBadge } from "@/components/blocks/shared/status-badge/status-badge";
import { AvatarStack } from "@/components/blocks/shared/user-avatar/user-avatar";
import { AppShellFloating } from "@/components/blocks/shell/app-shell-floating/app-shell-floating";
import { AppShellFullbleed } from "@/components/blocks/shell/app-shell-fullbleed/app-shell-fullbleed";
import { AppShellInset } from "@/components/blocks/shell/app-shell-inset/app-shell-inset";
import { TopBar } from "@/components/blocks/shell/top-bar/top-bar";
import { SideNavFloating } from "@/components/blocks/sidebar/side-nav-floating/side-nav-floating";
import { SideNavIcon } from "@/components/blocks/sidebar/side-nav-icon/side-nav-icon";
import { SideNavInset } from "@/components/blocks/sidebar/side-nav-inset/side-nav-inset";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { tenantNavGroups } from "@/lib/nav";

const searchSchema = z.object({
  shell: z.enum(["inset", "floating", "fullbleed"]).catch("inset"),
  sidebar: z.enum(["inset", "floating", "icon"]).catch("inset"),
});

/**
 * 组件预览页（不进 nav）：全屏舞台切换 3 套 shell × 3 套 sidebar（search param 选择），
 * 并陈列 status-badge / empty / error 等状态件。底部控制条切换变体。
 */
function PreviewPage() {
  const { tenantId } = Route.useParams();
  const { tenant } = useTenant();
  const { user } = useAuth();
  const { shell, sidebar } = Route.useSearch();
  const groups = useMemo(() => tenantNavGroups(tenantId), [tenantId]);

  const sidebarNode = useMemo(() => {
    const props = { groups, user, onLogout: () => {} };
    if (sidebar === "floating") return <SideNavFloating {...props} />;
    if (sidebar === "icon") return <SideNavIcon {...props} />;
    return <SideNavInset {...props} />;
  }, [groups, user, sidebar]);

  const topbar = (
    <TopBar onOpenSearch={() => {}} user={user ?? { name: "…" }} onLogout={() => {}} />
  );

  const content = (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone="success" pulse>
          running
        </StatusBadge>
        <StatusBadge tone="warning">degraded</StatusBadge>
        <StatusBadge tone="danger">failed</StatusBadge>
        <StatusBadge tone="info">deploying</StatusBadge>
        <StatusBadge tone="neutral">stopped</StatusBadge>
        <CopyButton value="svc_1a2b3c" label="复制 ID" />
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <AvatarStack
          users={[
            { name: "Qiulin Li" },
            { name: "Ada Lovelace" },
            { name: "Linus T" },
            { name: "Grace Hopper" },
            { name: "Alan Turing" },
          ]}
        />
        <div className="flex items-center gap-2 text-muted-foreground">
          <ResourceIcon kind="service" />
          <ResourceIcon kind="deployment" />
          <ResourceIcon kind="audit" />
          <ResourceIcon kind="api-key" />
          <ResourceIcon kind="team" />
          <ResourceIcon kind="unknown-kind" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>EmptyState</CardTitle>
          </CardHeader>
          <CardContent>
            <EmptyState title="还没有服务" description="创建第一个服务开始部署。" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>ErrorState</CardTitle>
          </CardHeader>
          <CardContent>
            <ErrorState error={{ status: 503, message: "unavailable" }} onRetry={() => {}} />
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardContent className="text-muted-foreground px-5 py-6 text-[13px]">
          当前组合：shell={shell} · sidebar={sidebar} · 租户 {tenant?.name ?? tenantId}。
          侧栏折叠态持久化（cookie）与 ⌘B 快捷键由 SidebarProvider 提供。
        </CardContent>
      </Card>
    </div>
  );

  return (
    <div className="bg-background fixed inset-0 z-40 flex flex-col">
      <div className="min-h-0 flex-1">
        {shell === "floating" ? (
          <AppShellFloating sidebar={sidebarNode} topbar={topbar}>
            {content}
          </AppShellFloating>
        ) : shell === "fullbleed" ? (
          <AppShellFullbleed sidebar={sidebarNode} topbar={topbar}>
            {content}
          </AppShellFullbleed>
        ) : (
          <AppShellInset sidebar={sidebarNode} topbar={topbar}>
            {content}
          </AppShellInset>
        )}
      </div>
      <div className="bg-background fixed bottom-0 z-30 flex w-full items-center justify-center gap-1 border-t p-2">
        {(["inset", "floating", "fullbleed"] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={shell === s ? "default" : "ghost"}
            render={<Link to="." search={{ shell: s, sidebar } as never} />}
          >
            shell: {s}
          </Button>
        ))}
        <span className="text-muted-foreground mx-2 text-xs">·</span>
        {(["inset", "floating", "icon"] as const).map((s) => (
          <Button
            key={s}
            size="sm"
            variant={sidebar === s ? "default" : "ghost"}
            render={<Link to="." search={{ shell, sidebar: s } as never} />}
          >
            sidebar: {s}
          </Button>
        ))}
        <span className="text-muted-foreground mx-2 text-xs">·</span>
        <Button
          size="sm"
          variant="outline"
          render={<Link to="/t/$tenantId" params={{ tenantId }} />}
        >
          退出预览
        </Button>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/_shell/t/$tenantId/preview")({
  validateSearch: (search) => searchSchema.parse(search),
  staticData: { title: "组件预览" },
  component: PreviewPage,
});
