/**
 * search 路由（M7-A3 批2 薄胶水）：结构在 pages/search.page.ts（definePage，
 * global-search-page 预设宿主）；跨资源搜索适配器按 tenantId 在此注入。
 */
import { PageRenderer } from "@patterns-ui/core/page";
import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { searchPageConfig, searchResourcesFor } from "@/pages/search.page";
import { resourceListTable } from "@/pages/tables";

function SearchPage() {
  const { tenantId } = Route.useParams();
  return (
    <PageRenderer
      page={searchPageConfig}
      table={resourceListTable}
      data={{ host: { debounceMs: 250, limit: 5, resources: searchResourcesFor(tenantId) } }}
    />
  );
}

const searchSchema = z.object({
  q: z.string().optional().catch(undefined),
});

export const Route = createFileRoute("/_shell/t/$tenantId/search")({
  staticData: { title: "Search" },
  validateSearch: searchSchema,
  component: SearchPage,
});
