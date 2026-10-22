/**
 * resource-detail-view —— L4 详情视图工厂（blocks 侧，docs/core-api.md §13）。
 *
 * def + id → resourceOf(def).useOne（loader 已预取 → 命中缓存）→ DetailPage 装配：
 * hero（名称 + id 副标题 + def.show 状态列）+ tabs（sections / sub-resource 占位 /
 * custom 登记制——tab.block（词表名）或 tab.sandbox（登记名）必填，渲染经 customTabs
 * 注入表解析，renderCustomTab 逃生位必须登记后使用，M7-A2）。
 * sections 的 cell 类型经 cellFor 渲染（与 inferColumns 同一标记体系）。
 */

import { defaultReferenceLabel } from "@patterns-ui/core/reference";
import type { ResourceDef } from "@patterns-ui/core/resource";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { Boxes, Pencil, Rocket } from "lucide-react";
import { useMemo, useState } from "react";
import { cellFor } from "@/components/blocks/cells/cell-for/cell-for";
import {
  listPathOf,
  resourceOf,
} from "@/components/blocks/list/resource-list-view/resource-list-view";
import { ErrorState } from "@/components/blocks/shared/error-state/error-state";
import { DetailGrid, type DetailGridItem } from "@/components/blocks/show/detail-grid/detail-grid";
import { DetailPage, useDetailTabParam } from "@/components/blocks/show/detail-page/detail-page";
import { RecordPager } from "@/components/blocks/show/record-pager/record-pager";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** L4 详情工厂的行约束（与 ResourceDef<TData extends RowData> 的泛型边界对齐） */
// biome-ignore lint/suspicious/noExplicitAny: ResourceDef 泛型边界形态（core-api §13）；仅作约束，禁止在实现体内新开 any
type AnyRow = Record<string, any>;

/**
 * custom tab 登记表（M7-A2 登记制）：键 = def.show.tabs[].block（词表名）或 sandbox 登记名，
 * 值 = 渲染组件（props 收 tab 上下文）。custom tab 必须引用登记名；未登记 → dev throw。
 */
// biome-ignore lint/suspicious/noExplicitAny: 登记组件 props 形态由登记方约定（注入边界，同 BlockTable）
export type CustomTabTable = Record<string, React.ComponentType<any>>;

export interface ResourceDetailViewProps<TData extends AnyRow> {
  def: ResourceDef<TData>;
  id: string;
  /** 详情路由的相对返回前缀（默认 '../../'：/services/svc-1 → ../..；宿主按路由层级给） */
  backPrefix?: string;
  /** 状态字段名（值经 status map 渲染；缺省不显示状态） */
  statusField?: string;
  /** 状态值 → tone 映射 */
  statusMap?: Record<string, "success" | "warning" | "danger" | "info" | "neutral">;
  /**
   * custom tab 登记表（M7-A2 登记制）：tab.block（词表名）/ tab.sandbox（登记名）→ 组件。
   * 渲染经本表解析；名字不在表 → throw（报错列出登记域全表）。
   */
  customTabs?: CustomTabTable;
  /**
   * custom tab 渲染器（宿主逃生位）：必须登记后使用（tab.block / tab.sandbox 至少其一），
   * 未登记的 tab 走本回调 → dev throw。
   */
  renderCustomTab?: (tabId: string, row: TData) => React.ReactNode;
  /**
   * hero 右侧动作（M7-A3 声明式；与 actions ReactNode 二选一——声明式优先）。
   * link：路由跳转（:tenantId/:id 模板替换）；run：类型化适配器；
   * open-dialog：打开登记的 dialogs 组件（登记制，同 customTabs）。
   */
  heroActions?: readonly ResourceDetailHeroAction<TData>[];
  /** 旧式 hero 动作逃生位（ReactNode；优先用 heroActions 声明式） */
  actions?: React.ReactNode;
  /**
   * hero 声明式配置：icon（宿主图标表名）、subtitleTemplate（{field} 模板替换）、
   * badgeFields（按列 meta.cell + cellOptions 渲染的徽标字段）
   */
  hero?: { icon?: string; subtitleTemplate?: string; badgeFields?: readonly string[] };
  /** 状态徽标活动态（呼吸点）值集 */
  statusPulseFor?: readonly string[];
  /** 相邻跳转（record-pager）：to 模板（:tenantId/:id 替换；pageSize 缺省 20） */
  pager?: { toTemplate: string; pageSize?: number };
  /**
   * 登记对话框表（M7-A3 登记制）：键 = heroActions[].dialog 名；组件收
   * { open, onOpenChange, row, def }。custom tab 经 ctx.openDialog(name) 触发同一状态源。
   */
  dialogs?: Record<string, React.ComponentType<ResourceDetailDialogProps<TData>>>;
  /** 声明式 inline-edit 的保存适配器（宿主注入：mutation 接线 + toast） */
  inlineSave?: (field: string, value: string | number, row: TData) => Promise<void>;
  className?: string;
}

/** hero 动作声明（M7-A3） */
export interface ResourceDetailHeroAction<TData> {
  id: string;
  label: string;
  kind: "link" | "run" | "open-dialog";
  /** kind:"link" 的目标模板（:tenantId/:id 替换） */
  to?: string;
  /** kind:"run" 的适配器 */
  run?: (row: TData, ctx: { navigate(to: string): Promise<void>; tenantId?: string }) => void;
  /** kind:"open-dialog" 的登记名 */
  dialog?: string;
  variant?: "default" | "outline";
  icon?: "pencil" | "rocket" | "boxes";
}

/** 详情页声明式 spec（M7-A3：id/inlineSave 等运行时值由路由胶水另行注入） */
export type ResourceDetailViewSpec<TData extends AnyRow> = Omit<
  ResourceDetailViewProps<TData>,
  "id" | "inlineSave" | "renderCustomTab"
> & { description?: string };

/** spec 工厂（pages/*.page.ts 用：上下文类型推断，配置无需显式泛型实参） */
export function defineResourceDetailPage<TData extends AnyRow>(
  spec: ResourceDetailViewSpec<TData>,
): ResourceDetailViewSpec<TData> {
  return spec;
}

/** 登记对话框组件 props（M7-A3） */
export interface ResourceDetailDialogProps<TData extends AnyRow> {
  open: boolean;
  onOpenChange(open: boolean): void;
  row: TData;
  def?: ResourceDef<TData>;
}

/** custom tab 组件 props（M7-A2 登记制 + M7-A3 openDialog 注入） */
export interface ResourceDetailCustomTabProps<TData extends AnyRow> {
  tabId: string;
  row: TData;
  def?: ResourceDef<TData>;
  /** 打开登记对话框（与 hero 动作同一状态源） */
  openDialog?(name: string): void;
}

/** 登记制解析：登记名 → 组件；未登记/不在表 → 明确报错（报错即目录） */
function resolveCustomTab(
  tab: { id: string; block?: string; sandbox?: string },
  table: CustomTabTable | undefined,
  // biome-ignore lint/suspicious/noExplicitAny: 登记组件 props 形态由登记方约定（注入边界，同 CustomTabTable）
): React.ComponentType<any> {
  const registered = tab.block ?? tab.sandbox;
  if (registered === undefined) {
    throw new Error(
      `resource-detail-view: custom tab「${tab.id}」未登记（M7-A2 登记制）：tab.block（词表名）或 tab.sandbox（登记名）必填其一；已登记名：[${Object.keys(table ?? {}).join(", ") || "（customTabs 注入表为空）"}]`,
    );
  }
  const Component = table?.[registered];
  if (Component === undefined) {
    throw new Error(
      `resource-detail-view: custom tab「${tab.id}」登记名「${registered}」不在 customTabs 注入表；已登记名：[${Object.keys(table ?? {}).join(", ") || "（空）"}]`,
    );
  }
  return Component;
}

const DETAIL_HERO_ICONS = { pencil: Pencil, rocket: Rocket, boxes: Boxes } as const;

/** 模板路径解析（:tenantId/:id 替换；值经 encodeURIComponent，与路由 params 行为一致） */
function resolveDetailTemplate(
  template: string,
  values: { tenantId?: string; id?: string },
): string {
  return template
    .replace(":tenantId", encodeURIComponent(values.tenantId ?? ""))
    .replace(":id", encodeURIComponent(values.id ?? ""));
}

export function ResourceDetailView<TData extends AnyRow>({
  def,
  id,
  backPrefix = "../../",
  statusField,
  statusMap,
  customTabs,
  renderCustomTab,
  actions,
  heroActions,
  hero,
  statusPulseFor,
  pager,
  dialogs,
  inlineSave,
  className,
}: ResourceDetailViewProps<TData>) {
  const resource = useMemo(() => resourceOf(def), [def]);
  const query = resource.useOne(id);
  const { activeTab, setTab } = useDetailTabParam("overview");
  const navigate = useNavigate();
  const routeParams = useParams({ strict: false }) as { tenantId?: string };
  const [openDialogName, setOpenDialogName] = useState<string | null>(null);
  // record-pager 数据源（pager 配置为模块级常量 → 条件 hook 调用跨渲染稳定）
  const pagerQuery = resource.useList(
    pager !== undefined ? { page: 1, pageSize: pager.pageSize ?? 20 } : { page: 1, pageSize: 1 },
  );

  const sections = def.show?.sections ?? [];
  const tabs = def.show?.tabs;

  if (query.isError) {
    return (
      <div className="mx-auto w-full max-w-5xl">
        <ErrorState
          error={query.error instanceof Error ? query.error : new Error("加载失败")}
          onRetry={() => void query.refetch()}
        />
      </div>
    );
  }

  const row = query.data;
  if (row === undefined) {
    return (
      <div className="mx-auto w-full max-w-5xl space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const record = row as Record<string, unknown>;
  const title = defaultReferenceLabel(record) || String(id);
  const listPath = listPathOf(def);

  const gridItemsFor = (sectionIndex: number): DetailGridItem[] =>
    (sections[sectionIndex]?.items ?? []).map((item) => ({
      label: item.label,
      field: item.field,
      // DetailGrid cell 类型与 inferColumns 的 meta.cell 共用（enum → enum-badge）
      cell: item.cell === "enum" ? ("enum-badge" as const) : (item.cell as DetailGridItem["cell"]),
      cellOptions: {
        ...item.cellOptions,
        options:
          item.cellOptions?.options !== undefined
            ? item.cellOptions.options
            : item.cell === "enum" || item.cell === "enum-badge"
              ? enumOptionsOf(def, item.field)
              : undefined,
        // inline-edit 保存适配器：宿主注入（结构在 def、接线在适配器——§3.4）
        onSave:
          item.cell === "inline-edit" && inlineSave !== undefined
            ? (value, data) =>
                inlineSave(item.field, value, data as TData & Record<string, unknown>)
            : item.cellOptions?.onSave,
      } as DetailGridItem["cellOptions"],
    }));

  const detailTabs =
    tabs && tabs.length > 0
      ? tabs.map((tab, i) => ({
          id: tab.id,
          label: tab.label,
          content:
            tab.kind === "sections" ? (
              <section className="bg-card text-card-foreground rounded-xl border p-6">
                <DetailGrid
                  title={sections[i]?.title ?? tab.label}
                  data={record}
                  items={gridItemsFor(i)}
                />
              </section>
            ) : tab.kind === "custom" ? (
              (() => {
                // 登记制（M7-A2）：custom tab 必须登记（block/sandbox）；渲染经注入表解析，
                // renderCustomTab 逃生位也必须登记后使用（未登记 → dev throw，报错列登记域）
                const CustomTab = resolveCustomTab(tab, customTabs);
                return renderCustomTab ? (
                  renderCustomTab(tab.id, row)
                ) : (
                  <CustomTab tabId={tab.id} row={row} def={def} openDialog={setOpenDialogName} />
                );
              })()
            ) : (
              <p className="text-muted-foreground bg-card rounded-xl border p-6 text-sm">
                子资源 {tab.resource ?? ""}（由宿主以 sub-resource tab 装配，如 deployments）
              </p>
            ),
        }))
      : sections.length > 0
        ? [
            {
              id: "overview",
              label: "概览",
              content: (
                <section className="bg-card text-card-foreground rounded-xl border p-6">
                  <DetailGrid title={sections[0]?.title} data={record} items={gridItemsFor(0)} />
                </section>
              ),
            },
          ]
        : [
            {
              id: "overview",
              label: "概览",
              content: (
                <section className="bg-card text-card-foreground rounded-xl border p-6">
                  <DetailGrid
                    data={record}
                    items={Object.keys(record)
                      .filter((field) => field !== "version")
                      .map((field) => ({ label: field, field }))}
                  />
                </section>
              ),
            },
          ];

  const statusValue = statusField !== undefined ? String(record[statusField] ?? "") : undefined;
  const statusTone =
    statusValue !== undefined && statusMap !== undefined
      ? ((statusMap[statusValue] as "success" | "warning" | "danger" | "info" | "neutral") ??
        "neutral")
      : undefined;
  const statusPulse =
    statusPulseFor !== undefined && statusValue !== undefined
      ? (statusPulseFor as readonly string[]).includes(statusValue)
      : undefined;

  // hero 声明式：subtitle 模板替换 + 徽标（列 meta.cell + cellOptions 渲染）+ 图标表
  const heroSubtitle =
    hero?.subtitleTemplate !== undefined
      ? hero.subtitleTemplate.replace(/\{(\w+)\}/g, (_, field: string) =>
          String(record[field] ?? ""),
        )
      : String(record.id ?? id);
  const heroBadges = (hero?.badgeFields ?? []).map((field) => {
    const column = def.columns.find((c) => c.id === field);
    const meta = column?.meta as
      | { cell?: string; cellOptions?: Record<string, unknown> }
      | undefined;
    const cellType = meta?.cell === "enum" ? "enum-badge" : meta?.cell;
    const CellComponent =
      cellType !== undefined
        ? cellFor(cellType as Parameters<typeof cellFor>[0], meta?.cellOptions ?? {})
        : undefined;
    return CellComponent ? <CellComponent key={field} value={record[field]} /> : null;
  });
  const heroIcon =
    hero?.icon !== undefined
      ? DETAIL_HERO_ICONS[hero.icon as keyof typeof DETAIL_HERO_ICONS]
      : undefined;

  // hero 动作（声明式优先；旧 actions ReactNode 逃生位保留）
  const heroActionsNode =
    heroActions === undefined
      ? actions
      : heroActions.map((action) => {
          const Icon = action.icon !== undefined ? DETAIL_HERO_ICONS[action.icon] : undefined;
          if (action.kind === "link" && action.to !== undefined) {
            const to = resolveDetailTemplate(action.to, {
              tenantId: routeParams.tenantId,
              id: String(record.id ?? id),
            });
            return (
              <Button
                key={action.id}
                variant={action.variant ?? "default"}
                render={<Link to={to as never} search />}
              >
                {Icon ? <Icon /> : null} {action.label}
              </Button>
            );
          }
          return (
            <Button
              key={action.id}
              variant={action.variant ?? "default"}
              onClick={() => {
                if (action.kind === "open-dialog" && action.dialog !== undefined) {
                  setOpenDialogName(action.dialog);
                } else if (action.run !== undefined) {
                  void action.run(row as TData, {
                    navigate: (to: string) => navigate({ to: to as never }),
                    tenantId: routeParams.tenantId,
                  });
                }
              }}
            >
              {Icon ? <Icon /> : null} {action.label}
            </Button>
          );
        });

  // 登记对话框（与 custom tab 的 openDialog 同一状态源）
  const DialogComponent =
    openDialogName !== null && dialogs !== undefined ? dialogs[openDialogName] : undefined;

  return (
    <>
      <DetailPage
        className={className}
        title={title}
        heroMeta={{
          icon: heroIcon,
          subtitle: heroSubtitle,
          badges: heroBadges.length > 0 ? heroBadges : undefined,
        }}
        status={
          statusValue !== undefined && statusTone !== undefined
            ? { tone: statusTone, label: statusValue, pulse: statusPulse }
            : undefined
        }
        actions={heroActionsNode}
        backTo={{ to: `${backPrefix}${listPath.replace(/^\//, "")}`, label: def.label ?? def.name }}
        lead={
          pager !== undefined ? (
            <RecordPager
              rows={pagerQuery.data?.rows as { id: string }[] | undefined}
              currentId={String(record.id ?? id)}
              to={(nextId) =>
                resolveDetailTemplate(pager.toTemplate, {
                  tenantId: routeParams.tenantId,
                  id: nextId,
                })
              }
            />
          ) : undefined
        }
        activeTab={activeTab}
        onTabChange={setTab}
        tabs={detailTabs}
      />
      {DialogComponent !== undefined ? (
        <DialogComponent
          open={openDialogName !== null}
          onOpenChange={(open: boolean) => {
            if (!open) setOpenDialogName(null);
          }}
          row={row as TData}
          def={def}
        />
      ) : null}
    </>
  );
}

/** 从列定义 meta.enumValues 取某字段的枚举选项（cell-enum-badge 用） */
function enumOptionsOf<TData extends AnyRow>(
  def: ResourceDef<TData>,
  field: string,
): { value: string; variant: "secondary" }[] | undefined {
  const column = def.columns.find((c) => c.id === field);
  const meta = column?.meta as { enumValues?: string[] } | undefined;
  return meta?.enumValues?.map((value) => ({ value, variant: "secondary" as const }));
}
