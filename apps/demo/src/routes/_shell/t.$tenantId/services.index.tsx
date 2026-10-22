/**
 * services 列表路由（M7-A3 批1 薄胶水）：配置在 pages/services-list.page.ts，
 * 组装在 ResourceListView 视图工厂；本文件只留路由声明 + search schema 组合
 * （def 生成档位 + group 分组开关，路由路径与 schema 形态不变——e2e/守卫依赖）。
 */
import { resourceListRouteOptions } from "@patterns-ui/core/resource";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ResourceListView } from "@/components/blocks/list/resource-list-view/resource-list-view";
import { servicesListSpec } from "@/pages/services-list.page";

const baseSearchSchema = resourceListRouteOptions(servicesListSpec.def).validateSearch;
const searchSchema = z.object({
  ...baseSearchSchema.shape,
  /** 分组开关（group=on → 按 env 分组 + replicas sum 聚合；避免数字串被 router JSON 化） */
  group: z.literal("on").optional().catch(undefined),
});

export const Route = createFileRoute("/_shell/t/$tenantId/services/")({
  staticData: { title: "Services" },
  validateSearch: searchSchema,
  component: ServicesIndexRoute,
});

function ServicesIndexRoute() {
  return <ResourceListView spec={servicesListSpec} />;
}
