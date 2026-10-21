import {
  Boxes,
  KeyRound,
  LayoutDashboard,
  Rocket,
  ScrollText,
  Settings,
  Users,
} from "lucide-react";
import type { NavGroup } from "@/components/blocks/sidebar/nav-group/nav-group";

/**
 * demo 的租户内导航配置（M2 起部分项由 defineResource/navFromResources 派生）。
 * 分组：Overview / Build[Services, Deployments] / Data[Audit, API Keys] / Manage[Team, Settings]。
 */
export function tenantNavGroups(tenantId: string): NavGroup[] {
  const t = (sub: string) => `/t/${tenantId}${sub}`;
  return [
    {
      items: [{ to: t(""), label: "Overview", icon: LayoutDashboard }],
    },
    {
      label: "Build",
      items: [
        { to: t("/services"), label: "Services", icon: Boxes },
        { to: t("/deployments"), label: "Deployments", icon: Rocket },
      ],
    },
    {
      label: "Data",
      items: [
        { to: t("/audit"), label: "Audit", icon: ScrollText, badge: { count: 4 } },
        { to: t("/api-keys"), label: "API Keys", icon: KeyRound },
      ],
    },
    {
      label: "Manage",
      items: [
        { to: t("/team"), label: "Team", icon: Users },
        { to: t("/settings"), label: "Settings", icon: Settings },
      ],
    },
  ];
}
