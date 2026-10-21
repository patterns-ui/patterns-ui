import { navFromResources } from "@fleetly/ui-component-core/resource";
import {
  Bell,
  Boxes,
  Compass,
  KeyRound,
  LayoutDashboard,
  Rocket,
  ScrollText,
  Settings,
  Users,
} from "lucide-react";
import type { NavGroup } from "@/components/blocks/sidebar/nav-group/nav-group";
import { resourceDefs } from "@/resources-m4";

/**
 * demo 的租户内导航配置（M4 起采用混合方式）：
 *  - 资源驱动部分：navFromResources(resourceDefs)（def.nav 分组/顺序/canAccess 过滤，
 *    fail-closed；本 demo 的 defs 无 canAccess → 全员可见）——目前只有 audit-events（指向 L4 版）。
 *  - 非资源页（overview/team/settings/regions/notifications/onboarding 等）手动声明。
 * 两组按分组名合并（同组资源项排前面）。
 */

/** lucide 图标名 → 组件（navFromResources 的 icon 是字符串名，宿主解析） */
const ICONS: Record<string, typeof Boxes> = {
  "scroll-text": ScrollText,
  boxes: Boxes,
};

export function tenantNavGroups(tenantId: string): NavGroup[] {
  const t = (sub: string) => `/t/${tenantId}${sub}`;
  // 资源驱动（user 缺省：无 canAccess 的 def 全可见；有 canAccess 的 fail-closed 隐藏）
  const fromResources = navFromResources(resourceDefs);
  const resourceItems: Record<string, { to: string; label: string; icon?: typeof Boxes }[]> = {};
  for (const group of fromResources) {
    resourceItems[group.group] = group.items.map((item) => ({
      // 资源 name 与路由段对齐：audit-events → 手写 /audit（L4 版挂 /audit2 对照）
      to: item.name === "audit-events" ? t("/audit2") : t(item.to),
      label: item.name === "audit-events" ? "Audit (L4)" : item.label,
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
        { to: t("/regions"), label: "Regions & Scale", icon: Compass },
      ],
    },
    {
      label: "Data",
      items: [
        { to: t("/audit"), label: "Audit (手写对照)", icon: ScrollText, badge: { count: 4 } },
        { to: t("/api-keys"), label: "API Keys", icon: KeyRound },
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

  // 合并：资源项插到同名分组最前（Data 组：Audit (L4) 在手写对照前）
  return manual.map((group) => {
    const extra = resourceItems[group.label ?? ""];
    if (extra === undefined) return group;
    return { ...group, items: [...extra, ...group.items] };
  });
}
