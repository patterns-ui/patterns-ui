import { cn } from "cn";
import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export interface AppShellProps {
  /** 侧栏（SideNavFloating 等，渲染 <Sidebar> 及其内容） */
  sidebar: ReactNode;
  /** 顶栏（TopBar） */
  topbar?: ReactNode;
  children: ReactNode;
  /** true 时内容区不加 padding（页面自管满幅布局） */
  fullBleed?: boolean;
}

/**
 * floating 应用壳：侧栏悬空浮起（配合 SideNavFloating），内容区通栏。
 */
export function AppShellFloating({ sidebar, topbar, children, fullBleed }: AppShellProps) {
  return (
    <SidebarProvider>
      {sidebar}
      {/* min-w-0：防 flex 子项被宽表格撑破视口（同 app-shell-inset） */}
      <SidebarInset className="min-w-0 md:peer-data-[variant=floating]:m-2">
        {topbar}
        <main className={cn("flex min-h-0 flex-1 flex-col", fullBleed ? "" : "gap-4 p-4")}>
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
