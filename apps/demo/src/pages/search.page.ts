/**
 * search 页配置（M7-A3 批2）：definePage("resource-list")，宿主 = 全局搜索结果页
 * 预设（⌘K 回车进入 ?q=）—— 纯配置（0 JSX）。资源适配器按 tenantId 构造。
 */
import { definePage } from "@patterns-ui/core/page";
import { Boxes, ScrollText, Users } from "lucide-react";
import { type SearchHit, searchAll } from "@/resources-m4";

export const searchPageConfig = definePage("resource-list", {
  host: "global-search-page",
  title: "Search",
});

/** 搜索资源适配器（tenantId 运行时参数；命中→条目的映射是类型化纯函数） */
function toHits(hits: readonly SearchHit[], type: string) {
  return hits
    .filter((hit) => hit.type === type)
    .map((hit) => ({ id: hit.id, title: hit.title, subtitle: hit.subtitle }));
}

export function searchResourcesFor(tenantId: string) {
  return [
    {
      name: "services",
      label: "Services",
      icon: Boxes,
      search: async (q: string) => {
        const hits = await searchAll(q, tenantId);
        return toHits(hits, "service").map((hit) => ({
          ...hit,
          to: `/t/${tenantId}/services/${encodeURIComponent(hit.id)}`,
        }));
      },
    },
    {
      name: "members",
      label: "Members",
      icon: Users,
      search: async (q: string) => toHits(await searchAll(q, tenantId), "member"),
    },
    {
      name: "audit-events",
      label: "Audit",
      icon: ScrollText,
      search: async (q: string) => toHits(await searchAll(q, tenantId), "audit-event"),
    },
  ];
}
