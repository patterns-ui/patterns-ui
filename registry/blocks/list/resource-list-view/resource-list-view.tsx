/**
 * resource-list-view —— L4 视图工厂（blocks 侧，docs/core-api.md §13；M7-A3 声明化扩厂）。
 *
 * defineResource 的文件路由一行装配：spec（def + 声明化页配置，pages/*.page.ts 产出）→
 * createResource（def 级 WeakMap 缓存）→ useResourceTable（def.list 配置 + def.filters +
 * parent 参数永久过滤）→ ListPage + FilterBar + AsyncState + DataTable + PaginationBar。
 * M7-A3 收编（组装下沉为工厂参数，页面 0 JSX）：
 *   - headerActions（refresh/export/toggle/new 声明式头动作，声明序渲染）
 *   - toolbar（new-items-banner + selection-bar 批量动作）
 *   - rowActions（行动作声明 + 类型化 ctx：navigate/deleteRow/update/toast 适配器）
 *   - table（sticky/mobile/分组开关（search param 受控）/聚合）
 *   - list（搜索字段/初始排序/保存视图 key/staleTime/「/」聚焦搜索）
 * 列渲染经 cellFor 消费列 meta.cell + meta.cellOptions（inferColumns 的推断标记或手写声明）。
 */
import type { ResourceClient, ResourceOf } from "@patterns-ui/core/data";
import { createResource } from "@patterns-ui/core/data";
import {
  createListColumnHelper,
  type ListColumnDef,
  paginationCapabilitiesOf,
  resolveListPagination,
  type SortSpec,
  useResourceTable,
} from "@patterns-ui/core/list";
import { defaultReferenceLabel } from "@patterns-ui/core/reference";
import type { ResourceDef } from "@patterns-ui/core/resource";
import { useNewItemsSignal } from "@patterns-ui/core/task";
import { Link, useNavigate, useParams, useSearch } from "@tanstack/react-router";
import { Columns3, Eye, type LucideIcon, Pencil, Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast as sonnerToast } from "sonner";
import { type CellForType, cellFor } from "@/components/blocks/cells/cell-for/cell-for";
import {
  actionsColumn,
  DataTable,
  selectionColumn,
} from "@/components/blocks/list/data-table/data-table";
import { ExportButton } from "@/components/blocks/list/export-button/export-button";
import { FilterBar } from "@/components/blocks/list/filter-bar/filter-bar";
import { ListPage, ListPageGrid } from "@/components/blocks/list/list-page/list-page";
import { NewItemsBanner } from "@/components/blocks/list/new-items-banner/new-items-banner";
import { PaginationBar } from "@/components/blocks/list/pagination-bar/pagination-bar";
import { RefreshBar } from "@/components/blocks/list/refresh-bar/refresh-bar";
import { SelectionBar } from "@/components/blocks/list/selection-bar/selection-bar";
import { useResourceMutations } from "@/components/blocks/list/use-resource-mutations/use-resource-mutations";
import { AsyncState } from "@/components/blocks/shared/async-state/async-state";
import { Button } from "@/components/ui/button";

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

/** 列定义装饰：meta.cell + meta.cellOptions → cellFor 渲染（无标记列保持原样） */
export function decorateColumns<TData extends AnyRow>(
  columns: ListColumnDef<TData>[],
): ListColumnDef<TData>[] {
  return columns.map((column) => {
    const meta = column.meta as
      | { cell?: string; enumValues?: string[]; cellOptions?: Record<string, unknown> }
      | undefined;
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
        : meta?.cellOptions;
    const CellComponent = cellFor(type, options ?? {});
    return {
      ...column,
      cell: (ctx: { getValue(): unknown }) => <CellComponent value={ctx.getValue()} />,
    } as ListColumnDef<TData>;
  });
}

// ---------------------------------------------------------------------------
// 声明化页配置（M7-A3：组装下沉为工厂参数；pages/*.page.ts 产出，0 JSX）
// ---------------------------------------------------------------------------

/** toast 适配器（行动作/批量动作 ctx；宿主注入 sonner，配置不 import UI） */
export interface ResourceToast {
  success(message: string): void;
  info(message: string): void;
  warning(message: string): void;
  error(message: string): void;
}

/** 头动作（声明序渲染于页头右侧；kind 判别） */
export type ResourceHeaderAction<TData extends AnyRow> =
  | { id: string; kind: "refresh" }
  | {
      id: string;
      kind: "export";
      filename: string;
      columns: readonly { key: string; header: string }[];
      /** 过滤感知导出适配器：按当前列表状态整取（类型化，非 UI 闭包） */
      fetch: (state: ResourceExportState) => Promise<TData[]>;
      /** 当前无排序时的导出排序（与页面原行为等价） */
      fallbackSort?: readonly SortSpec[];
    }
  | { id: string; kind: "toggle"; label: string; searchParam: string }
  | { id: string; kind: "new"; label: string; to: string };

export interface ResourceExportState {
  filters: unknown;
  sort: readonly SortSpec[];
  search: string;
}

/** 批量动作 ctx（工厂注入 mutations 适配器 + 清选） */
export interface ResourceSelectionContext {
  ids: readonly string[];
  clear(): void;
  toast: ResourceToast;
  bulkDelete(ids: readonly string[]): Promise<unknown>;
}

export interface ResourceToolbarSpec<TData extends AnyRow> {
  /** 新数据提示条（keyOf = 行主键读取） */
  newItems?: { keyOf: (row: TData) => string };
  /** 批量操作条 */
  selection?: {
    actions: readonly {
      id: string;
      label: string | ((count: number) => string);
      danger?: boolean;
      confirm?: string;
      run: (ctx: ResourceSelectionContext) => void | Promise<void>;
    }[];
  };
}

/** 行动作图标名表（封闭词表，只追加） */
export type ResourceRowActionIcon = "eye" | "pencil";

const ROW_ACTION_ICONS: Record<ResourceRowActionIcon, LucideIcon> = { eye: Eye, pencil: Pencil };

/** 行动作 ctx（工厂注入 navigate/mutations/toast 适配器；配置禁 hooks） */
export interface ResourceRowActionContext {
  tenantId: string | undefined;
  navigate(to: string): Promise<void>;
  toast: ResourceToast;
  /** undoable 删除（含 toast/撤销倒计时） */
  deleteRow(id: string): void;
  update(id: string, patch: Record<string, unknown>): void;
}

export interface ResourceRowActionSpec<TData extends AnyRow> {
  id: string;
  label: string;
  primary?: boolean;
  danger?: boolean;
  separatorBefore?: boolean;
  icon?: ResourceRowActionIcon;
  run: (row: TData, ctx: ResourceRowActionContext) => void | Promise<void>;
}

export interface ResourceListPageSpec<TData extends AnyRow> {
  def: ResourceDef<TData>;
  /** 页头副标题（产品说明文案；缺省无） */
  description?: string;
  /** 页头动作（声明序渲染） */
  headerActions?: readonly ResourceHeaderAction<TData>[];
  /** toolbar 槽（新数据提示 + 批量操作） */
  toolbar?: ResourceToolbarSpec<TData>;
  /** 行动作（声明；渲染为 actions 尾列——主操作平铺 + 更多菜单） */
  rowActions?: readonly ResourceRowActionSpec<TData>[];
  /** DataTable 形态 */
  table?: {
    stickyFirst?: boolean;
    stickyLast?: boolean;
    preferencesKey?: string;
    mobile?: "cards";
    /** 分组开关（search param 受控：param="on" → 按列分组 + 聚合） */
    grouping?: {
      searchParam: string;
      columns: readonly string[];
      labelFor?: (colId: string, value: unknown) => string;
      aggregates?: readonly { field: string; fn: "sum" | "avg" | "count" }[];
    };
  };
  /** 列表行为 */
  list?: {
    searchFields?: readonly string[];
    sort?: { initial: readonly SortSpec[]; multi?: boolean };
    /** 保存视图 resourceKey（filter-bar 的 saved-views-menu） */
    savedViewsKey?: string;
    staleTime?: number;
    /** 「/」聚焦搜索框（页面键盘接线下沉） */
    slashFocusSearch?: boolean;
  };
  /** 空态文案（缺省「暂无{label}」） */
  empty?: { title: string; description: string };
  /** 表格/磁贴切换（search param view=grid；渲染 表格/磁贴 按钮） */
  viewToggle?: boolean;
  /** dev-only Guesser（printGuess 推断报告打印；生产不跑） */
  guess?: boolean;
  /** ctx.update 的 hook 档位（与页面原 useUpdate 配置等价） */
  mutations?: { update?: { optimistic?: boolean; successToast?: string } };
  className?: string;
}

/** spec 工厂（pages/*.page.ts 用：上下文类型推断，配置无需显式泛型实参） */
export function defineResourceListPage<TData extends AnyRow>(
  spec: ResourceListPageSpec<TData>,
): ResourceListPageSpec<TData> {
  return spec;
}

export function ResourceListView<TData extends AnyRow>({
  spec,
}: {
  spec: ResourceListPageSpec<TData>;
}) {
  const { def } = spec;
  const resource = useMemo(() => resourceOf(def), [def]);
  const decorated = useMemo(() => decorateColumns(def.columns), [def.columns]);
  const params = useParams({ strict: false }) as { tenantId?: string };
  const tenantPrefix = params.tenantId !== undefined ? `/t/${params.tenantId}` : "";
  const search = useSearch({ strict: false }) as Record<string, unknown>;
  const navigate = useNavigate();
  const [autoIntervalMs, setAutoIntervalMs] = useState<number | false>(false);

  // 子资源：parent 参数（如 ?serviceId=svc-1）→ 永久过滤（进请求不进可见 filter UI）
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

  const { mode: listMode } = resolveListPagination(def.list);

  // 分组开关（search param 受控）：group=on → 按 spec 列分组 + 聚合
  const groupingSpec = spec.table?.grouping;
  const groupOn = groupingSpec !== undefined && search[groupingSpec.searchParam] === "on";
  const variant = spec.viewToggle && search.view === "grid" ? "grid" : "table";

  // mutations 适配器（ctx 注入；useResourceMutations 是 undoable 档的 sonner 消费层）
  const mutations = useResourceMutations(resource as never);
  const deleteRow = mutations.useDeleteWithUndo();
  const bulkDelete = mutations.useBulkDeleteWithUndo();
  const updateMut = resource.useUpdate(
    spec.mutations?.update === undefined
      ? undefined
      : {
          mutationMode: spec.mutations.update.optimistic ? ("optimistic" as const) : undefined,
          onSuccess:
            spec.mutations.update.successToast === undefined
              ? undefined
              : () => sonnerToast.success(spec.mutations?.update?.successToast ?? ""),
        },
  );

  const toastCtx = useMemo<ResourceToast>(
    () => ({
      success: (m) => sonnerToast.success(m),
      info: (m) => sonnerToast.info(m),
      warning: (m) => sonnerToast.warning(m),
      error: (m) => sonnerToast.error(m),
    }),
    [],
  );

  const rowActionCtx = useMemo<ResourceRowActionContext>(
    () => ({
      tenantId: params.tenantId,
      navigate: (to: string) => navigate({ to: to as never }),
      toast: toastCtx,
      deleteRow: (id: string) => deleteRow.mutate({ id }),
      update: (id: string, patch: Record<string, unknown>) =>
        updateMut.mutate({ id, ...patch } as never),
    }),
    [params.tenantId, navigate, toastCtx, deleteRow, updateMut],
  );

  const helper = helperFor<TData>();
  const tableColumns = useMemo(() => {
    const cols: ListColumnDef<TData>[] = [...decorated];
    if (spec.toolbar?.selection !== undefined) cols.unshift(selectionColumn(helper));
    const rowActionSpecs = spec.rowActions;
    if (rowActionSpecs !== undefined && rowActionSpecs.length > 0) {
      cols.push(
        actionsColumn(helper, () =>
          rowActionSpecs.map((action) => ({
            label: action.label,
            primary: action.primary,
            danger: action.danger,
            separatorBefore: action.separatorBefore,
            icon: action.icon === undefined ? undefined : ROW_ACTION_ICONS[action.icon],
            run: (r: TData) => action.run(r, rowActionCtx),
          })),
        ),
      );
    }
    return cols;
  }, [decorated, helper, rowActionCtx, spec.rowActions, spec.toolbar?.selection]);

  const list = useResourceTable<TData>({
    resource,
    mode: listMode,
    columns: tableColumns,
    filters: def.filters,
    facets: def.list?.facets,
    search: { enabled: true, fields: spec.list?.searchFields as string[] | undefined },
    sort: spec.list?.sort as { initial?: SortSpec[]; multi?: boolean } | undefined,
    pagination: def.list?.pageSize ? { initialPageSize: def.list.pageSize } : undefined,
    permanentFilters,
    queryOptions: { staleTime: spec.list?.staleTime, refetchInterval: autoIntervalMs },
    grouping: groupingSpec ? { columns: groupOn ? [...groupingSpec.columns] : [] } : undefined,
  });

  const signal = useNewItemsSignal(list.query, {
    key: (spec.toolbar?.newItems?.keyOf as ((row: TData) => string) | undefined) ?? (() => ""),
  });

  // 「/」聚焦搜索（原页面键盘接线下沉；data-slot 约定与 filter-bar 一致）
  const slashFocus = spec.list?.slashFocusSearch === true;
  useEffect(() => {
    if (!slashFocus) return;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== "/" || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }
      const input = document.querySelector<HTMLInputElement>('[data-slot="filter-bar-search"]');
      if (input) {
        event.preventDefault();
        input.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [slashFocus]);

  // dev-only Guesser（printGuess 推断报告；UI 无感）
  useEffect(() => {
    if (spec.guess === true && import.meta.env.DEV) {
      void printGuessLazy(def as never);
    }
  }, []);

  const selectedIds = useMemo(
    () => Object.keys(list.table.state.rowSelection),
    [list.table.state.rowSelection],
  );
  const clearSelection = () => list.table.setRowSelection({});

  const rows = list.table.getRowModel().rows.map((row) => row.original);
  const rowsEmpty = rows.length === 0;
  const hasActiveFilters = list.state.filters !== undefined || list.state.search !== "";

  const gridTiles = useMemo(() => {
    if (variant !== "grid") return [];
    return rows.map((row) => {
      const record = row as Record<string, unknown>;
      const title = defaultReferenceLabel(record);
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

  const paginationCaps = paginationCapabilitiesOf(listMode);
  const paginationBarMode = paginationCaps.canJump
    ? ("offset" as const)
    : listMode === "load-more"
      ? ("load-more" as const)
      : ("cursor" as const);

  const setView = (view: "table" | "grid") => {
    void navigate({
      search: (prev: Record<string, unknown>) =>
        view === "table" ? { ...prev, view: undefined } : { ...prev, view: "grid" },
    } as never);
  };

  const viewToggleActions =
    spec.viewToggle === true ? (
      <>
        <Button
          variant={variant === "table" ? "default" : "outline"}
          size="sm"
          onClick={() => setView("table")}
        >
          表格
        </Button>
        <Button
          variant={variant === "grid" ? "default" : "outline"}
          size="sm"
          onClick={() => setView("grid")}
        >
          磁贴
        </Button>
      </>
    ) : undefined;

  const declaredActions = spec.headerActions?.map((action) => {
    switch (action.kind) {
      case "refresh":
        return (
          <RefreshBar
            key={action.id}
            query={list.query}
            autoIntervalMs={autoIntervalMs}
            onAutoIntervalChange={setAutoIntervalMs}
          />
        );
      case "export":
        return (
          <ExportButton<TData>
            key={action.id}
            fetch={() =>
              action.fetch({
                filters: list.effectiveFilters,
                sort: list.state.sort.length > 0 ? list.state.sort : (action.fallbackSort ?? []),
                search: list.state.search,
              })
            }
            columns={action.columns as { key: string; header: string }[]}
            filename={action.filename}
          />
        );
      case "toggle":
        return (
          <Button
            key={action.id}
            variant={groupOn ? "default" : "outline"}
            size="sm"
            aria-pressed={groupOn}
            onClick={() => {
              void navigate({
                search: (prev: Record<string, unknown>) =>
                  groupOn
                    ? { ...prev, [action.searchParam]: undefined }
                    : { ...prev, [action.searchParam]: "on" },
              } as never);
            }}
          >
            <Columns3 data-icon="inline-start" />
            {action.label}
          </Button>
        );
      case "new":
        return (
          <Button key={action.id} render={<Link to={action.to as never} />}>
            <Plus /> {action.label}
          </Button>
        );
      default:
        return null;
    }
  });

  const headerActions =
    viewToggleActions === undefined && declaredActions === undefined ? undefined : (
      <>
        {viewToggleActions}
        {declaredActions}
      </>
    );

  const toolbar =
    spec.toolbar === undefined ? undefined : (
      <>
        <NewItemsBanner signal={signal} />
        {spec.toolbar.selection !== undefined ? (
          <SelectionBar
            count={selectedIds.length}
            onClear={clearSelection}
            actions={spec.toolbar.selection.actions.map((action) => ({
              label:
                typeof action.label === "function"
                  ? action.label(selectedIds.length)
                  : action.label,
              danger: action.danger,
              confirm: action.confirm,
              run: () =>
                action.run({
                  ids: selectedIds,
                  clear: clearSelection,
                  toast: toastCtx,
                  bulkDelete: (ids) => bulkDelete.mutateAsync({ ids: [...ids] }),
                }),
            }))}
          />
        ) : null}
      </>
    );

  const label = def.label ?? def.name;

  return (
    <ListPage
      title={label}
      description={
        def.parent && parentValue !== undefined
          ? `${def.parent.resource}/${parentValue} 的 ${label}`
          : spec.description
      }
      actions={headerActions}
      filter={
        def.filters && def.filters.length > 0 ? (
          <FilterBar
            list={list}
            defs={def.filters}
            savedViewsResourceKey={spec.list?.savedViewsKey}
            onRefresh={() => void list.query.refetch()}
          />
        ) : undefined
      }
      toolbar={toolbar}
      body={
        variant === "grid" ? (
          <ListPageGrid title={label} tiles={gridTiles} body={null} />
        ) : (
          <AsyncState
            query={list.query}
            rowsEmpty={rowsEmpty}
            hasActiveFilters={hasActiveFilters}
            onClearFilters={() => list.reset()}
            empty={spec.empty ?? { title: `暂无${label}`, description: "创建第一个记录开始。" }}
          >
            <DataTable
              table={list.table}
              preferencesKey={spec.table?.preferencesKey ?? def.name}
              stickyFirst={spec.table?.stickyFirst}
              stickyLast={spec.table?.stickyLast}
              mobile={spec.table?.mobile}
              grouping={
                groupingSpec
                  ? {
                      columns: groupOn ? [...groupingSpec.columns] : [],
                      labelFor: groupingSpec.labelFor,
                    }
                  : undefined
              }
              aggregates={
                groupingSpec !== undefined && groupOn && groupingSpec.aggregates !== undefined
                  ? [...groupingSpec.aggregates]
                  : undefined
              }
            />
          </AsyncState>
        )
      }
      pagination={
        paginationBarMode === "offset" ? (
          <PaginationBar list={{ ...list, hasNextPage: undefined }} mode="offset" />
        ) : (
          <PaginationBar
            list={{
              ...list,
              hasNextPage:
                list.query.data?.nextCursor !== undefined || paginationBarMode === "load-more",
            }}
            mode={paginationBarMode}
          />
        )
      }
      className={spec.className}
    />
  );
}

/** 列 helper（selection/actions 列工厂需要；模块级稳定身份，与 def.columns 的 TData 对齐） */
function helperFor<TData extends AnyRow>() {
  return createListColumnHelper<TData>();
}

/** printGuess 延迟导入（dev-only Guesser，避免生产路径引入推断器） */
async function printGuessLazy(def: ResourceDef<Record<string, never>>): Promise<void> {
  const { printGuess } = await import("@patterns-ui/core/resource");
  await printGuess(def as never);
}

/** 资源列表路径（相对租户根；宿主文件路由与 def.name 约定一致） */
// biome-ignore lint/suspicious/noExplicitAny: 与 ResourceDef 泛型形态一致（RowData 约束下 unknown 不协变）
export function listPathOf(def: ResourceDef<any>): string {
  return `/${def.name}`;
}
