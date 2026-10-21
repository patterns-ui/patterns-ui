import { Ellipsis, LogOut, type LucideIcon } from "lucide-react";
import { type AvatarUser, UserAvatar } from "@/components/blocks/shared/user-avatar/user-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  SidebarFooter,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSkeleton,
  useSidebar,
} from "@/components/ui/sidebar";

export interface NavUserItem {
  label: string;
  icon?: LucideIcon;
  onClick?: () => void;
}

export interface NavUserProps {
  user?: AvatarUser & { email?: string };
  onLogout: () => void;
  /** 自定义菜单项（显示在登出之前） */
  items?: NavUserItem[];
  isLoading?: boolean;
}

/** 侧栏底部用户卡：头像+姓名，展开菜单（自定义项 + 登出） */
export function NavUser({ user, onLogout, items, isLoading }: NavUserProps) {
  const { isMobile } = useSidebar();

  if (isLoading || !user) {
    return (
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuSkeleton showIcon />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    );
  }

  return (
    <SidebarFooter>
      <SidebarMenu>
        <SidebarMenuItem>
          <DropdownMenu>
            <DropdownMenuTrigger
              render={<SidebarMenuButton size="lg" className="data-open:bg-sidebar-accent" />}
            >
              <UserAvatar user={user} />
              <div className="grid flex-1 text-left leading-tight">
                <span className="truncate font-medium">{user.name}</span>
                <span className="text-xs text-sidebar-foreground/70 truncate">{user.email}</span>
              </div>
              <Ellipsis className="ml-auto size-4 text-sidebar-foreground/50" />
            </DropdownMenuTrigger>
            <DropdownMenuContent
              side={isMobile ? "bottom" : "right"}
              align="end"
              className="min-w-56"
            >
              <DropdownMenuGroup>
                <DropdownMenuLabel className="flex items-center gap-2 p-2">
                  <UserAvatar user={user} />
                  <div className="grid leading-tight">
                    <span className="truncate font-medium">{user.name}</span>
                    {user.email ? (
                      <span className="text-xs text-muted-foreground truncate">{user.email}</span>
                    ) : null}
                  </div>
                </DropdownMenuLabel>
                {items && items.length > 0 ? (
                  <>
                    <DropdownMenuSeparator />
                    {items.map((item) => (
                      <DropdownMenuItem key={item.label} onClick={item.onClick}>
                        {item.icon ? <item.icon /> : null}
                        {item.label}
                      </DropdownMenuItem>
                    ))}
                  </>
                ) : null}
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={onLogout}>
                <LogOut />
                登出
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarFooter>
  );
}
