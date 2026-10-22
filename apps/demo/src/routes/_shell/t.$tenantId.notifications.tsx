/**
 * notifications 路由（M7-A3 批2 薄胶水）：结构在 pages/notifications.page.ts
 * （definePage，notification-inbox 预设宿主）；client 在此注入。
 * 通知收件箱（未读数由 top-bar bell 共享缓存；全部已读后 badge 归零）。
 */
import { PageRenderer } from "@patterns-ui/core/page";
import { createFileRoute } from "@tanstack/react-router";
import { notificationsPageConfig } from "@/pages/notifications.page";
import { resourceListTable } from "@/pages/tables";
import { notificationClient } from "@/resources-m4";

function NotificationsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <PageRenderer
        page={notificationsPageConfig}
        table={resourceListTable}
        data={{ host: { client: notificationClient, title: "通知", pageSize: 30 } }}
      />
    </div>
  );
}

export const Route = createFileRoute("/_shell/t/$tenantId/notifications")({
  staticData: { title: "Notifications" },
  component: NotificationsPage,
});
