/**
 * resource-list-view —— L4 视图工厂（blocks 侧，docs/core-api.md §13）。
 *
 * defineResource 的文件路由一行装配：def → createResource（def 级 WeakMap 缓存）→
 * useResourceTable（def.list 配置 + def.filters + parent 参数永久过滤）→
 * ListPage + FilterBar + AsyncState + DataTable + PaginationBar。
 * 列渲染经 cellFor 消费列 meta.cell（inferColumns 的推断标记）。
 */
import type { ResourceClient, ResourceOf } from "@patterns-ui/core/data";
import { createResource } from "@patterns-ui/core/data";
import { type ListColumnDef, useResourceTable } from "@patterns-ui/core/list";
import type { ResourceDef } from "@patterns-ui/core/resource";
import { useParams, useSearch } from "@tanstack/react-router";
import { useMemo } from "react";
import { type CellForType, cellFor } from "@/components/blocks/cells/cell-for/cell-for";
import { DataTable } from "@/components/blocks/list/data-table/data-table";
import { FilterBar } from "@/components/blocks/list/filter-bar/filter-bar";
import { ListPage, ListPageGrid } from "@/components/blocks/list/list-page/list-page";
import { PaginationBar } from "@/components/blocks/list/pagination-bar/pagination-bar";
import { AsyncState } from "@/components/blocks/shared/async-state/async-state";

/** L4 视图工厂的行约束（与 core ResourceDef<TData extends RowData> 的泛型边界对齐） */
// biome-ignore lint/suspicious/noExplicitAny: ResourceDef 泛型边界形态（core-api §13）；仅作约束，禁止在实现体内新开 any
type AnyRow = Record<string, any>;

/** def → Resource 实例缓存（同一 def 复用；hooks 身份稳定） */
const resourceCache = new WeakMap<
  ResourceClient<unknown, unknown, unknown>,
  ResourceOf<Record<string, unknown>>
>();

export function resourceOf<TData extends AnyRow>(def: ResourceDef<TData>): ResourceOf<TData> {
  const client = def.client as unknown as ResourceClient<unknown, unknown, unknown>;
  let cached = resourceCache.get(client) as ResourceOf<TData> | undefined;
  if (cached === undefined) {
    cached = createResource<TData>({
      name: def.name,
      client: def.client,
      tenantScoped: def.tenantScoped !== false,
    });
    resourceCache.set(client, cached as unknown as ResourceOf<Record<string, unknown>>);
  }
  return cached;
}

/** meta.cell（inferColumns 产出）→ cellFor 类型（enum → enum-badge） */
function cellTypeOf(metaCell: string | undefined): CellForType | undefined {
  if (metaCell === undefined) return undefined;
  if (metaCell === "enum") return "enum-badge";
  if (
    [
      "id",
      "time",
      "status",
      "user",
      "boolean",
      "number",
      "enum-badge",
      "tags",
      "progress",
    ].includes(metaCell)
  ) {
    return metaCell as CellForType;
  }
  return undefined;
}

/** 列定义装饰：meta.cell → cellFor 渲染（无标记列保持原样） */
export function decorateColumns<TData extends AnyRow>(
  columns: ListColumnDef<TData>[],
): ListColumnDef<TData>[] {
  return columns.map((column) => {
    const meta = column.meta as { cell?: string; enumValues?: string[] } | undefined;
    const type = cellTypeOf(meta?.cell);
    if (type === undefined) return column;
    const options =
      type === "enum-badge" && meta?.enumValues
        ? {
            options: meta.enumValues.map((value) => ({
              value,
              variant: "secondary" as const,
            })),
          }
        : undefined;
    const CellComponent = cellFor(type, options);
    return {
      ...column,
      cell: (ctx: { getValue(): unknown }) => <CellComponent value={ctx.getValue()} />,
    } as ListColumnDef<TData>;
  });
}

export interface ResourceListViewProps<TData extends AnyRow> {
  def: ResourceDef<TData>;
  /** 展示变体（默认 table；grid = 磁贴墙，标题取 name/title/id 字段） */
  variant?: "table" | "grid";
  /** 页头副标题（产品说明文案；缺省无） */
  description?: string;
  /** 页头右侧动作（新建按钮等） */
  actions?: React.ReactNode;
  /** DataTable 附加高级模式 props（grouping/tree/aggregates/inline/virtual/mobile 透传） */
  tableProps?: Omit<React.ComponentProps<typeof DataTable<TData>>, "table" | "preferencesKey">;
  preferencesKey?: string;
  /** 列表页脚注 */
  appendix?: React.ReactNode;
  className?: string;
}

export function ResourceListView<TData extends AnyRow>({
  def,
  variant = "table",
  description,
  actions,
  tableProps,
  preferencesKey,
  appendix,
  className,
}: ResourceListViewProps<TData>) {
  const resource = useMemo(() => resourceOf(def), [def]);
  const columns = useMemo(() => decorateColumns(def.columns), [def.columns]);
  // 租户前缀（/t/:tenantId/... 布局下取当前参数；磁贴/详情链接拼绝对路径）
  const params = useParams({ strict: false }) as { tenantId?: string };
  const tenantPrefix = params.tenantId !== undefined ? `/t/${params.tenantId}` : "";

  // 子资源：parent 参数（如 ?serviceId=svc-1）→ 永久过滤（进请求不进可见 filter UI）
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const parentValue =
    def.parent && typeof search[def.parent.param] === "string"
      ? (search[def.parent.param] as string)
      : undefined;
  const permanentFilters = useMemo(
    () =>
      parentValue !== undefined && def.parent
        ? { field: def.parent.param, op: "eq" as const, value: parentValue }
        : undefined,
    [parentValue, def.parent],
  );

  const list = useResourceTable<TData>({
    resource,
    mode: def.list?.mode ?? "server-offset",
    columns,
    filters: def.filters,
    facets: def.list?.facets,
    search: { enabled: true },
    pagination: def.list?.pageSize ? { initialPageSize: def.list.pageSize } : undefined,
    permanentFilters,
  });

  const rows = list.table.getRowModel().rows.map((row) => row.original);
  const rowsEmpty = rows.length === 0;
  const hasActiveFilters = list.state.filters !== undefined || list.state.search !== "";

  const gridTiles = useMemo(() => {
    if (variant !== "grid") return [];
    return rows.map((row) => {
      const record = row as Record<string, unknown>;
      const title = String(record.name ?? record.title ?? record.id ?? "");
      return {
        title,
        description: record.description !== undefined ? String(record.description) : undefined,
        to:
          record.id !== undefined
            ? `${tenantPrefix}${listPathOf(def)}/${encodeURIComponent(String(record.id))}`
            : undefined,
      };
    });
  }, [variant, rows, def, tenantPrefix]);

  const listMode = def.list?.mode ?? "server-offset";

  return (
    <ListPage
      title={def.label ?? def.name}
      description={
        def.parent && parentValue !== undefined
          ? `${def.parent.resource}/${parentValue} 的 ${def.label ?? def.name}`
          : description
      }
      actions={actions}
      filter={
        def.filters && def.filters.length > 0 ? (
          <FilterBar list={list} defs={def.filters} onRefresh={() => void list.query.refetch()} />
        ) : undefined
      }
      body={
        variant === "grid" ? (
          <ListPageGrid title={def.label ?? def.name} tiles={gridTiles} body={null} />
        ) : (
          <AsyncState
            query={list.query}
            rowsEmpty={rowsEmpty}
            hasActiveFilters={hasActiveFilters}
            onClearFilters={() => list.reset()}
            empty={{ title: `暂无${def.label ?? def.name}`, description: "创建第一个记录开始。" }}
          >
            <DataTable
              table={list.table}
              preferencesKey={preferencesKey ?? def.name}
              mobile="cards"
              {...tableProps}
            />
          </AsyncState>
        )
      }
      pagination={
        listMode === "server-cursor" || listMode === "load-more" ? (
          <PaginationBar
            list={{
              ...list,
              hasNextPage: list.query.data?.nextCursor !== undefined || listMode === "load-more",
            }}
            mode={listMode === "server-cursor" ? "cursor" : "load-more"}
          />
        ) : (
          <PaginationBar list={list} mode="offset" />
        )
      }
      appendix={appendix}
      className={className}
    />
  );
}

/** 资源列表路径（相对租户根；宿主文件路由与 def.name 约定一致） */
// biome-ignore lint/suspicious/noExplicitAny: 与 ResourceDef 泛型形态一致（RowData 约束下 unknown 不协变）
export function listPathOf(def: ResourceDef<any>): string {
  return `/${def.name}`;
}
