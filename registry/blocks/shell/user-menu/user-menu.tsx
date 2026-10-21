import type { LucideIcon } from "lucide-react";
import { LogOut } from "lucide-react";
import { type AvatarUser, UserAvatar } from "@/components/blocks/shared/user-avatar/user-avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface UserMenuItem {
  label: string;
  icon?: LucideIcon;
  onClick?: () => void;
}

export interface UserMenuProps {
  user: AvatarUser & { email?: string };
  onLogout: () => void;
  /** 自定义菜单项（显示在登出之前） */
  items?: UserMenuItem[];
}

/** 顶栏用户菜单：头像按钮 + 姓名/邮箱 + 自定义项 + 登出 */
export function UserMenu({ user, onLogout, items }: UserMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon-sm" aria-label="用户菜单" />}>
        <UserAvatar user={user} size="sm" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
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
  );
}
