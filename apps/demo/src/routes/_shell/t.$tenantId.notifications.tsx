import { createFileRoute } from "@tanstack/react-router";
import { NotificationInbox } from "@/components/blocks/list/notification-inbox/notification-inbox";
import { notificationClient } from "@/resources-m4";

/** 通知收件箱（未读数由 top-bar bell 共享缓存；全部已读后 badge 归零） */
function NotificationsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl">
      <NotificationInbox client={notificationClient} title="通知" pageSize={30} />
      <p className="text-muted-foreground/80 mt-4 text-xs">
        数据走 ResourceClient 约定：list（keyset cursor）/ PATCH 单条已读 / POST read-all；
        顶栏铃铛的未读数与收件箱共享同一 queryKey 缓存。
      </p>
    </div>
  );
}

export const Route = createFileRoute("/_shell/t/$tenantId/notifications")({
  staticData: { title: "Notifications" },
  component: NotificationsPage,
});
