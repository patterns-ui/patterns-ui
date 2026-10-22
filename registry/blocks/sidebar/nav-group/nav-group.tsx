import type { CanFn } from "@fleetly/patterns-ui-core/auth";
import { filterByCanFn, useCan } from "@fleetly/patterns-ui-core/auth";
import { Link, useRouterState } from "@tanstack/react-router";
import { cn } from "cn";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";

export interface NavItem {
  to: string;
  label: string;
  icon?: LucideIcon;
  /** 角标计数；hot=true 用 danger 色强调 */
  badge?: { count: number; hot?: boolean };
  /** 权限过滤（fail-closed；缺省 = 对所有人可见）。例：canAccess: (can) => can("read", "services") */
  canAccess?: (can: CanFn) => boolean;
}

export interface NavGroup {
  label?: string;
  items: NavItem[];
  /** 组内折叠（点击组标题展开/收起） */
  collapsible?: boolean;
  /** collapsible 组的初始状态，默认展开 */
  defaultCollapsed?: boolean;
}

/** active 判定：pathname === to || startsWith(to + '/')（docs/blocks.md sidebar 约定） */
export function isNavItemActive(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`);
}

export function NavGroupMenu({ group }: { group: NavGroup }) {
  const can = useCan();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [collapsed, setCollapsed] = useState(group.defaultCollapsed ?? false);

  const items = useMemo(() => filterByCanFn(group.items, can), [group.items, can]);
  if (items.length === 0) {
    return null;
  }

  const collapsible = group.collapsible ?? false;

  return (
    <SidebarGroup>
      {group.label ? (
        collapsible ? (
          <SidebarGroupLabel
            className="cursor-pointer hover:text-sidebar-foreground select-none"
            onClick={() => setCollapsed((v) => !v)}
          >
            <ChevronDown className={cn("size-4 transition-transform", collapsed && "-rotate-90")} />
            {group.label}
          </SidebarGroupLabel>
        ) : (
          <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
        )
      ) : null}
      <SidebarGroupContent className={cn(collapsible && collapsed && "hidden")}>
        <SidebarMenu>
          {items.map((item) => {
            const active = isNavItemActive(pathname, item.to);
            const Icon = item.icon;
            return (
              <SidebarMenuItem key={item.to}>
                <SidebarMenuButton
                  isActive={active}
                  tooltip={item.label}
                  render={<Link to={item.to as never} />}
                >
                  {Icon ? <Icon /> : null}
                  <span>{item.label}</span>
                </SidebarMenuButton>
                {item.badge ? (
                  <SidebarMenuBadge
                    className={cn(
                      item.badge.hot
                        ? "bg-status-danger-bg text-status-danger"
                        : "text-sidebar-foreground/70",
                    )}
                  >
                    {item.badge.count > 99 ? "99+" : item.badge.count}
                  </SidebarMenuBadge>
                ) : null}
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
