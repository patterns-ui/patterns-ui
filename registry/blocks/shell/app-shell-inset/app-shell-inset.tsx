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
      {/* min-w-0：flex 子项默认 min-width:auto 会被宽表格等内容撑破视口（内容区横向溢出，
          行操作尾列看似“被裁”）。收敛后横向滚动在卡片内的滚动容器发生，sticky 尾列才成立。 */}
      <SidebarInset className="min-w-0">
        {topbar}
        <main className={cn("flex min-h-0 flex-1 flex-col", fullBleed ? "" : "gap-4 p-4")}>
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
