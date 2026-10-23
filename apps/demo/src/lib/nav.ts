import { navFromResources } from "@patterns-ui/core/resource";
import {
  Bell,
  Boxes,
  Compass,
  KeyRound,
  LayoutDashboard,
  Rocket,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
} from "lucide-react";
import type { NavGroup } from "@/components/blocks/sidebar/nav-group/nav-group";
import { resourceDefs } from "@/resources-m4";

/**
 * 租户内导航（混合方式）：
 *  - 资源驱动：navFromResources(resourceDefs)（def.nav 分组/顺序/canAccess 过滤，fail-closed）。
 *    资源 name → 路由段的映射在这里做（audit-events → /audit）。
 *  - 非资源页（overview/services/…）手动声明。
 * 两组按分组名合并（同组资源项排前面）。
 */

/** lucide 图标名 → 组件（navFromResources 的 icon 是字符串名，宿主解析） */
const ICONS: Record<string, typeof Boxes> = {
  "scroll-text": ScrollText,
  boxes: Boxes,
};

/** 资源 name → 租户内路由段（约定不一致的在这里映射） */
const RESOURCE_ROUTE: Record<string, string> = {
  "audit-events": "/audit",
};

export function tenantNavGroups(tenantId: string): NavGroup[] {
  const t = (sub: string) => `/t/${tenantId}${sub}`;
  // 资源驱动（user 缺省：无 canAccess 的 def 全可见；有 canAccess 的 fail-closed 隐藏）
  const fromResources = navFromResources(resourceDefs);
  const resourceItems: Record<string, { to: string; label: string; icon?: typeof Boxes }[]> = {};
  for (const group of fromResources) {
    resourceItems[group.group] = group.items.map((item) => ({
      to: t(RESOURCE_ROUTE[item.name] ?? item.to),
      label: item.label,
      icon: item.icon ? ICONS[item.icon] : undefined,
    }));
  }

  const manual: NavGroup[] = [
    {
      items: [{ to: t(""), label: "Overview", icon: LayoutDashboard }],
    },
    {
      label: "Build",
      items: [
        { to: t("/services"), label: "Services", icon: Boxes },
        { to: t("/deployments"), label: "Deployments", icon: Rocket },
        { to: t("/regions"), label: "Regions", icon: Compass },
      ],
    },
    {
      label: "Data",
      items: [
        { to: t("/api-keys"), label: "API Keys", icon: KeyRound },
        { to: t("/certificates"), label: "Certificates", icon: ShieldCheck },
      ],
    },
    {
      label: "Manage",
      items: [
        { to: t("/team"), label: "Team", icon: Users },
        { to: t("/notifications"), label: "Notifications", icon: Bell },
        { to: t("/onboarding"), label: "Onboarding", icon: Compass },
        { to: t("/settings"), label: "Settings", icon: Settings },
      ],
    },
  ];

  // 合并：资源项插到同名分组最前（Data 组：Audit 在 API Keys 前）
  return manual.map((group) => {
    const extra = resourceItems[group.label ?? ""];
    if (extra === undefined) return group;
    return { ...group, items: [...extra, ...group.items] };
  });
}
