/**
 * team 页配置（M7-A3 批2）：definePage("resource-list")，宿主 = team 模式预设
 * —— 纯配置（0 JSX）。client 接线与「接受第一个待处理邀请」演示区由路由胶水注入。
 */
import { definePage } from "@patterns-ui/core/page";

export const teamPageConfig = definePage("resource-list", {
  host: "team-page",
  title: "Team",
});
