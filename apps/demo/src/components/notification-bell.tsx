import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { useUnreadCount } from "@/components/blocks/list/notification-inbox/notification-inbox";
import { Button } from "@/components/ui/button";
import { notificationClient } from "@/resources-m4";

/** top-bar 通知铃铛：未读数 badge（与收件箱共享 queryKey 缓存）→ 点击进收件箱 */
export function NotificationBell({ tenantId }: { tenantId: string }) {
  const unread = useUnreadCount(notificationClient);
  void tenantId; // 路径经 Link params；client 自身按当前 /t/:tid 前缀取数
  return (
    <Button
      variant="ghost"
      size="sm"
      className="relative"
      render={<Link to="/t/$tenantId/notifications" params={{ tenantId }} search />}
    >
      <Bell />
      {unread > 0 ? (
        <span className="bg-primary text-primary-foreground absolute top-1 right-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold tabular-nums">
          {unread > 99 ? "99+" : unread}
        </span>
      ) : null}
    </Button>
  );
}
