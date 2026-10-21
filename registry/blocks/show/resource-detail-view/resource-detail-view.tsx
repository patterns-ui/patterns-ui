/**
 * resource-detail-view —— L4 详情视图工厂（blocks 侧，docs/core-api.md §13）。
 *
 * def + id → resourceOf(def).useOne（loader 已预取 → 命中缓存）→ DetailPage 装配：
 * hero（名称 + id 副标题 + def.show 状态列）+ tabs（sections / sub-resource 占位 / custom render）。
 * sections 的 cell 类型经 cellFor 渲染（与 inferColumns 同一标记体系）。
 */

import type { ResourceDef } from "@fleetly/ui-component-core/resource";
import { useMemo } from "react";
import {
  listPathOf,
  resourceOf,
} from "@/components/blocks/list/resource-list-view/resource-list-view";
import { ErrorState } from "@/components/blocks/shared/error-state/error-state";
import { DetailGrid, type DetailGridItem } from "@/components/blocks/show/detail-grid/detail-grid";
import { DetailPage, useDetailTabParam } from "@/components/blocks/show/detail-page/detail-page";
import { Skeleton } from "@/components/ui/skeleton";

/** L4 详情工厂的行约束（与 ResourceDef<TData extends RowData> 的泛型边界对齐） */
// biome-ignore lint/suspicious/noExplicitAny: ResourceDef 泛型边界形态（core-api §13）；仅作约束，禁止在实现体内新开 any
type AnyRow = Record<string, any>;

export interface ResourceDetailViewProps<TData extends AnyRow> {
  def: ResourceDef<TData>;
  id: string;
  /** 详情路由的相对返回前缀（默认 '../../'：/services/svc-1 → ../..；宿主按路由层级给） */
  backPrefix?: string;
  /** 状态字段名（值经 status map 渲染；缺省不显示状态） */
  statusField?: string;
  /** 状态值 → tone 映射 */
  statusMap?: Record<string, "success" | "warning" | "danger" | "info" | "neutral">;
  /** custom tab 渲染器（tab.kind === 'custom' 时调用） */
  renderCustomTab?: (tabId: string, row: TData) => React.ReactNode;
  /** hero 右侧动作 */
  actions?: React.ReactNode;
  className?: string;
}

export function ResourceDetailView<TData extends AnyRow>({
  def,
  id,
  backPrefix = "../../",
  statusField,
  statusMap,
  renderCustomTab,
  actions,
  className,
}: ResourceDetailViewProps<TData>) {
  const resource = useMemo(() => resourceOf(def), [def]);
  const query = resource.useOne(id);
  const { activeTab, setTab } = useDetailTabParam("overview");

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
  const title = String(record.name ?? record.title ?? record.id ?? id);
  const listPath = listPathOf(def);

  const gridItemsFor = (sectionIndex: number): DetailGridItem[] =>
    (sections[sectionIndex]?.items ?? []).map((item) => ({
      label: item.label,
      field: item.field,
      // DetailGrid cell 类型与 inferColumns 的 meta.cell 共用（enum → enum-badge）
      cell: item.cell === "enum" ? ("enum-badge" as const) : (item.cell as DetailGridItem["cell"]),
      cellOptions: {
        options:
          item.cell === "enum" || item.cell === "enum-badge"
            ? enumOptionsOf(def, item.field)
            : undefined,
      },
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
              (renderCustomTab?.(tab.id, row) ?? (
                <p className="text-muted-foreground text-sm">
                  自定义 tab（renderCustomTab 未提供）
                </p>
              ))
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
      ? (statusMap[statusValue] ?? "neutral")
      : undefined;

  return (
    <DetailPage
      className={className}
      title={title}
      heroMeta={{ subtitle: String(record.id ?? id) }}
      status={
        statusValue !== undefined && statusTone !== undefined
          ? { tone: statusTone, label: statusValue }
          : undefined
      }
      actions={actions}
      backTo={{ to: `${backPrefix}${listPath.replace(/^\//, "")}`, label: def.label ?? def.name }}
      activeTab={activeTab}
      onTabChange={setTab}
      tabs={detailTabs}
    />
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
