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
 * inset 形态侧栏：侧栏为独立卡面、与内容区分层（内容区带边框圆角）。
 * 折叠方式 offcanvas（收起后完全移出让位内容）。
 */
export function SideNavInset({
  groups,
  tenantSlot,
  footerSlot,
  user,
  onLogout,
  navUserItems,
}: SideNavProps) {
  return (
    <Sidebar variant="inset" collapsible="offcanvas">
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
