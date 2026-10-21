import type { ReactNode } from "react";
import type { AvatarUser } from "@/components/blocks/shared/user-avatar/user-avatar";
import { type NavGroup, NavGroupMenu } from "@/components/blocks/sidebar/nav-group/nav-group";
import { NavUser, type NavUserItem } from "@/components/blocks/sidebar/nav-user/nav-user";
import { TenantSwitcher } from "@/components/blocks/sidebar/tenant-switcher/tenant-switcher";
import { Sidebar, SidebarContent } from "@/components/ui/sidebar";

export interface SideNavProps {
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
 * 可折叠至图标形态的侧栏：折叠后只剩图标列（hover 出 tooltip），可腾出最大内容宽度。
 */
export function SideNavIcon({
  groups,
  tenantSlot,
  footerSlot,
  user,
  onLogout,
  navUserItems,
}: SideNavProps) {
  return (
    <Sidebar variant="sidebar" collapsible="icon">
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
