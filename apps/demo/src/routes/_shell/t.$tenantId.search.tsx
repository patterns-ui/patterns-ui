import { createFileRoute } from "@tanstack/react-router";
import { Boxes, ScrollText, Users } from "lucide-react";
import { z } from "zod";
import { GlobalSearchPage } from "@/components/blocks/shell/global-search-page/global-search-page";
import { searchAll } from "@/resources-m4";

/** 跨资源搜索（⌘K 命令面板输入后回车直达 ?q=） */
function SearchPage() {
  const { tenantId } = Route.useParams();

  return (
    <GlobalSearchPage
      debounceMs={250}
      limit={5}
      resources={[
        {
          name: "services",
          label: "Services",
          icon: Boxes,
          search: async (q) => {
            const hits = await searchAll(q, tenantId);
            return hits
              .filter((hit) => hit.type === "service")
              .map((hit) => ({
                id: hit.id,
                title: hit.title,
                subtitle: hit.subtitle,
                to: `/t/${tenantId}/services/${encodeURIComponent(hit.id)}`,
              }));
          },
        },
        {
          name: "members",
          label: "Members",
          icon: Users,
          search: async (q) => {
            const hits = await searchAll(q, tenantId);
            return hits
              .filter((hit) => hit.type === "member")
              .map((hit) => ({ id: hit.id, title: hit.title, subtitle: hit.subtitle }));
          },
        },
        {
          name: "audit-events",
          label: "Audit Events",
          icon: ScrollText,
          search: async (q) => {
            const hits = await searchAll(q, tenantId);
            return hits
              .filter((hit) => hit.type === "audit-event")
              .map((hit) => ({ id: hit.id, title: hit.title, subtitle: hit.subtitle }));
          },
        },
      ]}
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
