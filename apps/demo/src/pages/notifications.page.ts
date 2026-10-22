/**
 * notifications 页配置（M7-A3 批2）：definePage("resource-list")，宿主 = 通知收件箱
 * 预设 —— 纯配置（0 JSX）。client（未读数由 top-bar bell 共享缓存）由路由胶水注入。
 */
import { definePage } from "@patterns-ui/core/page";

export const notificationsPageConfig = definePage("resource-list", {
  host: "notification-inbox",
  title: "Notifications",
});
