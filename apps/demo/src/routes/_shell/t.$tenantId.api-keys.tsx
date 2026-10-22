/** API Keys 路由（M7-A3 批1 薄胶水）：配置在 pages/api-keys.page.ts，渲染出口 ApiKeysView。 */
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { ApiKeysView } from "@/components/pages/api-keys";

const searchSchema = z.object({}).catch({});

export const Route = createFileRoute("/_shell/t/$tenantId/api-keys")({
  staticData: { title: "API Keys" },
  validateSearch: searchSchema,
  component: ApiKeysView,
});
