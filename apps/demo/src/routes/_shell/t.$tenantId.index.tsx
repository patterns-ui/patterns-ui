/** 租户概览路由（M7-A3 批2 薄胶水）：配置在 pages/overview.page.ts，渲染出口 OverviewView。 */
import { createFileRoute } from "@tanstack/react-router";
import { OverviewView } from "@/components/pages/overview";

export const Route = createFileRoute("/_shell/t/$tenantId/")({
  staticData: { title: "Overview" },
  component: OverviewView,
});
