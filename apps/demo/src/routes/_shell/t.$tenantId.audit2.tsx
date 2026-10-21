import { printGuess, resourceListRouteOptions } from "@fleetly/ui-component-core/resource";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { ResourceListView } from "@/components/blocks/list/resource-list-view/resource-list-view";
import { Button } from "@/components/ui/button";
import { auditDef } from "@/resources-m4";

/**
 * L4 对照页：defineResource + resourceListRouteOptions + ResourceListView 装配。
 * 与 M2 手写版（/audit，约 220 行）功能等价；本页约 60 行。
 * dev 模式下跑 Guesser（console 打印推断列/表单配置）。
 */

function Audit2Page() {
  const navigate = useNavigate();
  const { tenantId } = Route.useParams();
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
      preferencesKey="audit-events-l4"
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
      appendix={
        <p className="text-muted-foreground/80 text-xs">
          L4 对照：本页由 defineResource（inferColumns 推断列 + filters + list.mode=server-cursor）
          生成，与手写版{" "}
          <Link
            to="/t/$tenantId/audit"
            params={{ tenantId }}
            search={undefined as never}
            className="underline"
          >
            /audit
          </Link>{" "}
          功能等价（keyset 翻页 / action facet / 时间范围 / 高级过滤）。打开 devtools 控制台可看
          Guesser 打印的推断配置。
        </p>
      }
    />
  );
}

const listOptions = resourceListRouteOptions(auditDef);

export const Route = createFileRoute("/_shell/t/$tenantId/audit2")({
  ...listOptions,
  beforeLoad: listOptions.beforeLoad as never,
  staticData: { title: "Audit (L4)" },
  component: Audit2Page,
});
