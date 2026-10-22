import type { CrumbResolve } from "@fleetly/ui-component-core/router";
import { Search } from "lucide-react";
import type { ReactNode } from "react";
import type { AvatarUser } from "@/components/blocks/shared/user-avatar/user-avatar";
import { Breadcrumbs } from "@/components/blocks/shell/breadcrumbs/breadcrumbs";
import { ThemeToggle } from "@/components/blocks/shell/theme-toggle/theme-toggle";
import { UserMenu } from "@/components/blocks/shell/user-menu/user-menu";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";

export interface TopBarProps {
  /** 打开 ⌘K 命令面板 */
  onOpenSearch: () => void;
  user: AvatarUser & { email?: string };
  onLogout: () => void;
  /** 右侧扩展位（如通知铃铛） */
  extra?: ReactNode;
  /** 面包屑与搜索位之间的扩展位 */
  center?: ReactNode;
  /** 面包屑租户段反查（配合 useTenant 数据） */
  breadcrumbResolve?: CrumbResolve;
}

/**
 * 顶栏：SidebarTrigger + 面包屑 + 搜索入口（⌘K）+ ThemeToggle + extra + UserMenu。
 */
export function TopBar({
  onOpenSearch,
  user,
  onLogout,
  extra,
  center,
  breadcrumbResolve,
}: TopBarProps) {
  return (
    <header
      data-slot="top-bar"
      className="flex h-14 shrink-0 items-center gap-2 border-b bg-background px-4"
    >
      <SidebarTrigger />
      <Separator orientation="vertical" className="mr-1 h-4" />
      <div className="min-w-0 flex-1">
        <Breadcrumbs resolve={breadcrumbResolve} />
      </div>
      {center}
      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="gap-2 text-muted-foreground"
          onClick={onOpenSearch}
        >
          <Search data-icon="inline-start" />
          <span className="hidden md:inline">搜索…</span>
          <kbd className="pointer-events-none hidden items-center gap-0.5 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground md:flex">
            ⌘K
          </kbd>
        </Button>
        <ThemeToggle />
        {extra}
        <UserMenu user={user} onLogout={onLogout} />
      </div>
    </header>
  );
}
