/** services 编辑路由（M7-A3 批1 薄胶水）：配置在 pages/services-form.page.ts，渲染出口 ServiceFormView。 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ServiceFormView } from "@/components/pages/service-form";
import { servicesEditSpec } from "@/pages/services-edit.page";

const searchSchema = z.object({}).catch({});

export const Route = createFileRoute("/_shell/t/$tenantId/services/$id/edit")({
  staticData: { title: "编辑服务" },
  validateSearch: searchSchema,
  component: () => <ServiceFormView spec={servicesEditSpec} />,
});
