/**
 * detail-page —— 详情页模板（docs/blocks.md show/）。
 * 返回链 + hero(图标/头像 + 标题 + StatusBadge + actions) + tabs(深链) + sections/子资源。
 * tabs 受控（activeTab/onTabChange）；URL 深链接经 useDetailTabParam（TanStack Router）。
 */

import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { cn } from "cn";
import { ArrowLeft, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import {
  StatusBadge,
  type StatusBadgeTone,
} from "@/components/blocks/shared/status-badge/status-badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export interface DetailHeroMeta {
  /** 标题前的图标或头像（ReactNode；resource-icon / user-avatar 产出） */
  visual?: ReactNode;
  icon?: LucideIcon;
  /** 副标题（如 id / 描述） */
  subtitle?: ReactNode;
  badges?: ReactNode[];
}

export interface DetailPageTab {
  id: string;
  label: string;
  content: ReactNode;
  /** 徽标（如计数） */
  badge?: ReactNode;
}

export interface DetailPageProps {
  title: ReactNode;
  heroMeta?: DetailHeroMeta;
  /** StatusBadge tone + 文案（经 status-badge 单源） */
  status?: { tone: StatusBadgeTone; label: string; pulse?: boolean };
  /** hero 右侧动作区 */
  actions?: ReactNode;
  backTo?: { to: string; label?: string };
  tabs: DetailPageTab[];
  /** 当前 tab id（受控；配合 useDetailTabParam 深链） */
  activeTab?: string;
  onTabChange?: (id: string) => void;
  /** hero 下方、tabs 上方的槽（如 record-pager） */
  lead?: ReactNode;
  className?: string;
}

/** 详情页模板：hero 区 + 深链 tabs + tab 内容。 */
export function DetailPage({
  title,
  heroMeta,
  status,
  actions,
  backTo,
  tabs,
  activeTab,
  onTabChange,
  lead,
  className,
}: DetailPageProps) {
  const current = activeTab ?? tabs[0]?.id;
  const Icon = heroMeta?.icon;
  return (
    <div className={cn("mx-auto flex w-full max-w-5xl flex-col gap-6", className)}>
      {backTo ? (
        <div>
          <Button
            variant="ghost"
            size="sm"
            className="-ml-2 text-muted-foreground"
            render={<Link to={backTo.to} />}
          >
            <ArrowLeft /> {backTo.label ?? "返回"}
          </Button>
        </div>
      ) : null}

      {/* hero */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          {heroMeta?.visual ? (
            <div className="bg-muted text-muted-foreground flex size-12 shrink-0 items-center justify-center rounded-xl border">
              {heroMeta.visual}
            </div>
          ) : Icon ? (
            <div className="bg-muted text-muted-foreground flex size-12 shrink-0 items-center justify-center rounded-xl border">
              <Icon className="size-5" />
            </div>
          ) : null}
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
              {status ? (
                <StatusBadge tone={status.tone} pulse={status.pulse}>
                  {status.label}
                </StatusBadge>
              ) : null}
              {heroMeta?.badges}
            </div>
            {heroMeta?.subtitle ? (
              <p className="text-muted-foreground font-mono text-xs">{heroMeta.subtitle}</p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>

      {lead}

      {/* tabs（受控：深链由页面经 useDetailTabParam 接线） */}
      <Tabs value={current} onValueChange={(v) => onTabChange?.(v as string)}>
        <TabsList className="w-full justify-start overflow-x-auto">
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id}>
              {tab.label}
              {tab.badge !== undefined ? (
                <span className="text-muted-foreground ml-1.5 text-xs">{tab.badge}</span>
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>
        {tabs.map((tab) => (
          <TabsContent key={tab.id} value={tab.id} className="mt-4">
            {tab.content}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}

/**
 * tab 深链胶水：URL search 参数 `tab` 读写（保留其余 search 参数，如来源列表过滤）。
 *
 * ```tsx
 * const { activeTab, setTab } = useDetailTabParam()
 * <DetailPage tabs={...} activeTab={activeTab} onTabChange={setTab} />
 * ```
 */
export function useDetailTabParam(defaultTab: string, searchKey = "tab") {
  const navigate = useNavigate();
  const raw = useRouterState({
    select: (s) => {
      const value = (s.location.search as Record<string, unknown>)[searchKey];
      return typeof value === "string" && value !== "" ? value : undefined;
    },
  });
  const activeTab = raw ?? defaultTab;
  const setTab = (id: string) => {
    if (id === activeTab) return;
    void navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        [searchKey]: id === defaultTab ? undefined : id,
      }),
    } as never);
  };
  return { activeTab, setTab };
}
