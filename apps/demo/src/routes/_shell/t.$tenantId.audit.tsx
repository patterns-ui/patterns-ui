/**
 * Audit 路由（M7-A3 批1 薄胶水）：defineResource 单一产品入口——
 * 配置在 pages/audit.page.ts，装配走 ResourceListView；守卫/搜索 schema 由
 * resourceListRouteOptions(def) 生成（与迁移前一致）。
 */
import { resourceListRouteOptions } from "@patterns-ui/core/resource";
import { createFileRoute } from "@tanstack/react-router";
import { ResourceListView } from "@/components/blocks/list/resource-list-view/resource-list-view";
import { auditListSpec } from "@/pages/audit.page";

const listOptions = resourceListRouteOptions(auditListSpec.def);

export const Route = createFileRoute("/_shell/t/$tenantId/audit")({
  ...listOptions,
  beforeLoad: listOptions.beforeLoad as never,
  staticData: { title: "Audit" },
  component: AuditRoute,
});

function AuditRoute() {
  return <ResourceListView spec={auditListSpec} />;
}
