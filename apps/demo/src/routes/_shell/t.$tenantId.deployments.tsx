/** Deployments 路由（M7-A3 批1 薄胶水）：配置在 pages/deployments.page.ts，渲染出口 DeploymentsView。 */
import { createFileRoute } from "@tanstack/react-router";
import { DeploymentsView } from "@/components/pages/deployments";

export const Route = createFileRoute("/_shell/t/$tenantId/deployments")({
  staticData: { title: "Deployments" },
  component: DeploymentsView,
});
