import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export interface AppShellProps {
  /** 侧栏（SideNavInset 等，渲染 <Sidebar> 及其内容） */
  sidebar: ReactNode;
  /** 顶栏（TopBar） */
  topbar?: ReactNode;
  children: ReactNode;
}

/**
 * 满幅工作台壳（日志 / 终端类页面）：内容区无卡面、无 padding，页面自管密度。
 */
export function AppShellFullbleed({ sidebar, topbar, children }: AppShellProps) {
  return (
    <SidebarProvider>
      {sidebar}
      <SidebarInset>
        {topbar}
        <main className="flex min-h-0 flex-1 flex-col">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
}
