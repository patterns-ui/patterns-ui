import { printGuess, resourceListRouteOptions } from "@fleetly/ui-component-core/resource";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ResourceListView } from "@/components/blocks/list/resource-list-view/resource-list-view";
import { Button } from "@/components/ui/button";
import { auditDef } from "@/resources-m4";

/**
 * Audit（defineResource 单一产品入口）：
 * defineResource + resourceListRouteOptions + ResourceListView 装配。
 * dev 模式下跑 Guesser（console 打印推断列/表单配置；UI 无感）。
 */

function AuditPage() {
  const navigate = useNavigate();
  const search = Route.useSearch() as { view?: string };
  // 同路由 search-only 更新（view 是查询语义 → URL）
  const setView = (view: "table" | "grid") => {
    void navigate({
      search: (prev: Record<string, unknown>) =>
        view === "table" ? { ...prev, view: undefined } : { ...prev, view: "grid" },
    } as never);
  };

  // dev-only Guesser：打印 inferColumns/inferFormFields 报告（生产不跑）
  useEffect(() => {
    if (import.meta.env.DEV) {
      void printGuess(auditDef);
    }
  }, []);

  const variant = search.view === "grid" ? "grid" : "table";

  return (
    <ResourceListView
      def={auditDef}
      variant={variant}
      description="谁在什么时间对哪些资源做了什么。"
      preferencesKey="audit-events"
      actions={
        <>
          <Button
            variant={variant === "table" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("table")}
          >
            表格
          </Button>
          <Button
            variant={variant === "grid" ? "default" : "outline"}
            size="sm"
            onClick={() => setView("grid")}
          >
            磁贴
          </Button>
        </>
      }
    />
  );
}

const listOptions = resourceListRouteOptions(auditDef);

export const Route = createFileRoute("/_shell/t/$tenantId/audit")({
  ...listOptions,
  beforeLoad: listOptions.beforeLoad as never,
  staticData: { title: "Audit" },
  component: AuditPage,
});
