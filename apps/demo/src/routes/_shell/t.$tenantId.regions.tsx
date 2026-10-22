/** Regions 路由（M7-A3 批1 薄胶水）：配置在 pages/regions.page.ts，渲染出口 RegionsView。 */
import { createFileRoute } from "@tanstack/react-router";
import { RegionsView } from "@/components/pages/regions";

export const Route = createFileRoute("/_shell/t/$tenantId/regions")({
  staticData: { title: "Regions" },
  component: RegionsView,
});
