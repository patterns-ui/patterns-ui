/**
 * audit 列表页配置（M7-A3 批1）：defineResource + ResourceListView 声明化 spec。
 *
 * auditDef（defineResource，keyset 契约）在 resources-m4 定义（导航注册表共享）；
 * 本文件持有页面级配置：说明文案 + 表格/磁贴切换（search param view）+ dev Guesser。
 */
import { defineResourceListPage } from "@/components/blocks/list/resource-list-view/resource-list-view";
import { auditDef } from "@/resources-m4";

export const auditListSpec = defineResourceListPage({
  def: auditDef,
  description: "谁在什么时间对哪些资源做了什么。",
  viewToggle: true,
  guess: true,
});
