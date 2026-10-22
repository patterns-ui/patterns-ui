import { cn } from "cn";
import type { ReactNode } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";

export type AppShellVariant = "floating" | "inset" | "fullbleed";

export interface AppShellProps {
  /**
   * 壳形态（默认 inset）：
   * - floating：侧栏悬空浮起（配 SideNav variant="floating"），内容区通栏；
   * - inset：侧栏为独立卡面、内容区带边框圆角（默认形态）；
   * - fullbleed：满幅工作台壳（日志 / 终端类页面），内容区无 padding，页面自管密度。
   */
  variant?: AppShellVariant;
  /** 侧栏（SideNav 等，渲染 <Sidebar> 及其内容；形态与壳用同名 variant 对齐） */
  sidebar: ReactNode;
  /** 顶栏（TopBar） */
  topbar?: ReactNode;
  children: ReactNode;
  /** true 时内容区不加 padding（页面自管满幅布局；fullbleed 变体恒为满幅，忽略此值） */
  fullBleed?: boolean;
}

/**
 * 应用壳（基座 + variant）：SidebarProvider + SidebarInset + 内容 main。
 * 三形态收敛为单一实现（M6-D 变体下沉）：形态差异只有内容区 margin 与 padding。
 * 折叠态经 SidebarProvider 的 cookie 持久化（⌘B 切换）。
 */
export function AppShell({
  variant = "inset",
  sidebar,
  topbar,
  children,
  fullBleed,
}: AppShellProps) {
  const padded = variant !== "fullbleed" && fullBleed !== true;
  return (
    <SidebarProvider data-variant={variant}>
      {sidebar}
      {/* min-w-0：防 flex 子项被宽表格撑破视口（内容区横向溢出时，
          横向滚动在卡片内的滚动容器发生，sticky 尾列才成立） */}
      <SidebarInset
        className={cn("min-w-0", variant === "floating" && "md:peer-data-[variant=floating]:m-2")}
      >
        {topbar}
        <main className={cn("flex min-h-0 flex-1 flex-col", padded ? "gap-4 p-4" : "")}>
          {children}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}
