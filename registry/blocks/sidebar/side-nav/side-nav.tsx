import type { ReactNode } from "react";
import type { AvatarUser } from "@/components/blocks/shared/user-avatar/user-avatar";
import { type NavGroup, NavGroupMenu } from "@/components/blocks/sidebar/nav-group/nav-group";
import { NavUser, type NavUserItem } from "@/components/blocks/sidebar/nav-user/nav-user";
import { TenantSwitcher } from "@/components/blocks/sidebar/tenant-switcher/tenant-switcher";
import { Sidebar, SidebarContent } from "@/components/ui/sidebar";

export type SideNavVariant = "floating" | "icon" | "inset";

/** 变体 → Sidebar 原语参数：floating 悬浮卡面图标列 / icon 平边图标列 / inset 卡面 offcanvas */
const VARIANT_TO_SIDEBAR: Record<
  SideNavVariant,
  { variant: "sidebar" | "floating" | "inset"; collapsible: "icon" | "offcanvas" }
> = {
  floating: { variant: "floating", collapsible: "icon" },
  icon: { variant: "sidebar", collapsible: "icon" },
  inset: { variant: "inset", collapsible: "offcanvas" },
};

export interface SideNavProps {
  /**
   * 形态（默认 inset）：
   * - floating：悬空浮起（ring + shadow + 圆角），可折叠至图标列；
   * - icon：可折叠至图标列（折叠后只剩图标列，hover 出 tooltip，腾出最大内容宽度）；
   * - inset：侧栏为独立卡面、与内容区分层，offcanvas 折叠（收起后完全移出让位内容）。
   */
  variant?: SideNavVariant;
  groups: NavGroup[];
  /** sidebar header 位插槽，默认渲染 TenantSwitcher（需 TenantProvider） */
  tenantSlot?: ReactNode;
  /** sidebar footer 位插槽，默认渲染 NavUser */
  footerSlot?: ReactNode;
  user?: (AvatarUser & { email?: string }) | undefined;
  onLogout?: () => void;
  navUserItems?: NavUserItem[];
}

/**
 * 租户侧栏（基座 + variant）：TenantSwitcher（header）+ NavGroupMenu 列表 + NavUser（footer）。
 * 三形态收敛为单一实现（M6-D 变体下沉）：形态差异映射到 Sidebar 原语的 variant × collapsible。
 */
export function SideNav({
  variant = "inset",
  groups,
  tenantSlot,
  footerSlot,
  user,
  onLogout,
  navUserItems,
}: SideNavProps) {
  return (
    <Sidebar {...VARIANT_TO_SIDEBAR[variant]}>
      {tenantSlot ?? <TenantSwitcher />}
      <SidebarContent>
        {groups.map((group) => (
          <NavGroupMenu key={group.label ?? group.items[0]?.to} group={group} />
        ))}
      </SidebarContent>
      {footerSlot ?? <NavUser user={user} onLogout={onLogout ?? (() => {})} items={navUserItems} />}
    </Sidebar>
  );
}
