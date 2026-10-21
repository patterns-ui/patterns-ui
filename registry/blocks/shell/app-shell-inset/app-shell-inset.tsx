import { cn } from "cn";
import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export interface AppShellProps {
  /** 侧栏（SideNavInset 等，渲染 <Sidebar> 及其内容） */
  sidebar: ReactNode;
  /** 顶栏（TopBar） */
  topbar?: ReactNode;
  children: ReactNode;
  /** true 时内容区不加 padding（页面自管满幅布局） */
  fullBleed?: boolean;
}

/**
 * inset 应用壳：侧栏为独立卡面、内容区带边框圆角（默认形态）。
 * 侧栏折叠状态经 SidebarProvider 的 cookie 持久化。
 */
export function AppShellInset({ sidebar, topbar, children, fullBleed }: AppShellProps) {
  return (
    <SidebarProvider>
      {sidebar}
      <SidebarInset>
        {topbar}
        <main className={cn("flex min-h-0 flex-1 flex-col", fullBleed ? "" : "gap-4 p-4")}>
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
