import type { UseInlineEditResult } from "@fleetly/patterns-ui-core/inline";
import type {
  ListColumnDef,
  ListColumnHelper,
  ListTable,
  ListTableFeatures,
} from "@fleetly/patterns-ui-core/list";
import { type Cell, FlexRender, type Row, type RowData } from "@tanstack/react-table";
import { useVirtualizer } from "@tanstack/react-virtual";
import { cn } from "cn";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  type LucideIcon,
  MoreHorizontal,
} from "lucide-react";
import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useIsMobile } from "@/hooks/use-mobile";

// ---------------------------------------------------------------------------
// 列工厂（选择 / 展开 / 行操作）
// ---------------------------------------------------------------------------

/** 行选择列（含表头全选 indeterminate） */
export function selectionColumn<TData extends RowData>(
  helper: ListColumnHelper<TData>,
): ListColumnDef<TData> {
  return helper.display({
    id: "__select",
    enableSorting: false,
    enableHiding: false,
    size: 44,
    header: ({ table }) => (
      <Checkbox
        aria-label="全选本页"
        checked={table.getIsAllRowsSelected()}
        indeterminate={!table.getIsAllRowsSelected() && table.getIsSomeRowsSelected()}
        onCheckedChange={() => table.toggleAllRowsSelected()}
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        aria-label="选择该行"
        checked={row.getIsSelected()}
        onCheckedChange={() => row.toggleSelected()}
        onClick={(e) => e.stopPropagation()}
      />
    ),
  }) as ListColumnDef<TData>;
}

/** 展开行列（配合 expandable.render） */
export function expandColumn<TData extends RowData>(
  helper: ListColumnHelper<TData>,
): ListColumnDef<TData> {
  return helper.display({
    id: "__expand",
    enableSorting: false,
    enableHiding: false,
    size: 40,
    header: () => null,
    cell: ({ row }) => (
      <button
        type="button"
        aria-label={row.getIsExpanded() ? "折叠" : "展开"}
        onClick={(e) => {
          e.stopPropagation();
          row.toggleExpanded();
        }}
        className="text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronRight
          className={cn("size-4 transition-transform", row.getIsExpanded() && "rotate-90")}
        />
      </button>
    ),
  }) as ListColumnDef<TData>;
}

export interface RowActionItem<TData> {
  label: string;
  /**
   * 主操作：平铺为行内图标按钮（真实产品惯例：查看/编辑平铺，删除/封禁类收进更多菜单）。
   * danger 项强制归入更多菜单，即使标了 primary。
   */
  primary?: boolean;
  danger?: boolean;
  icon?: LucideIcon;
  run: (row: TData) => void | Promise<void>;
  separatorBefore?: boolean;
}

export interface ActionsColumnOptions {
  /** sr-only 表头文案（默认「操作」） */
  label?: string;
}

/** 行操作列：主操作平铺 + 「更多操作」DropdownMenu（触发按钮带 data-row-actions-trigger，供键盘 Enter 打开） */
export function actionsColumn<TData extends RowData>(
  helper: ListColumnHelper<TData>,
  rowActions: (row: TData) => RowActionItem<TData>[],
  opts: ActionsColumnOptions | string = {},
): ListColumnDef<TData> {
  const label = typeof opts === "string" ? opts : (opts.label ?? "操作");
  return helper.display({
    id: "__actions",
    enableSorting: false,
    enableHiding: false,
    enableResizing: false,
    // 宽度自适应内容（主操作 + 更多菜单）；不声明 size，由表格自动布局
    header: () => <span className="sr-only">{label}</span>,
    cell: ({ row, table }) => (
      <RowActionsCell row={row} table={table as ListTable<TData>} rowActions={rowActions} />
    ),
  }) as ListColumnDef<TData>;
}

function RowActionsCell<TData extends RowData>({
  row,
  table,
  rowActions,
}: {
  row: { id: string; original: TData };
  table: ListTable<TData>;
  rowActions: (row: TData) => RowActionItem<TData>[];
}) {
  void table;
  const items = rowActions(row.original);
  if (items.length === 0) return null;
  const primary = items.filter((item) => item.primary && !item.danger);
  const more = items.filter((item) => !(item.primary && !item.danger));
  if (primary.length === 0 && more.length === 0) return null;
  return (
    <div className="flex items-center justify-end gap-0.5 whitespace-nowrap">
      {primary.map((item) => (
        <Button
          key={item.label}
          variant="ghost"
          size="icon"
          title={item.label}
          aria-label={item.label}
          className="size-7"
          onClick={(e) => {
            e.stopPropagation();
            void item.run(row.original);
          }}
        >
          {item.icon ? <item.icon /> : <span className="text-xs">{item.label}</span>}
        </Button>
      ))}
      {more.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                className="size-7"
                aria-label="更多操作"
                data-row-actions-trigger={row.id}
                onClick={(e) => e.stopPropagation()}
              />
            }
          >
            <MoreHorizontal />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            {more.map((item, i) => (
              <div key={`${item.label}-${i}`}>
                {item.separatorBefore && i > 0 ? <DropdownMenuSeparator /> : null}
                <DropdownMenuItem
                  variant={item.danger ? "destructive" : undefined}
                  onClick={() => void item.run(row.original)}
                >
                  {item.icon ? <item.icon data-icon="inline-start" /> : null}
                  {item.label}
                </DropdownMenuItem>
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 列偏好（localStorage，偏好语义：fc:cols:<resource>）
// ---------------------------------------------------------------------------

export type TableDensity = "comfortable" | "compact";

interface ColumnPrefs {
  density?: TableDensity;
  columnVisibility?: Record<string, boolean>;
  columnOrder?: string[];
  columnSizing?: Record<string, number>;
}

function readPrefs(key: string): ColumnPrefs {
  try {
    const raw = globalThis.localStorage?.getItem(`fc:cols:${key}`);
    return raw ? (JSON.parse(raw) as ColumnPrefs) : {};
  } catch {
    return {};
  }
}

function writePrefs(key: string, prefs: ColumnPrefs): void {
  try {
    globalThis.localStorage?.setItem(`fc:cols:${key}`, JSON.stringify(prefs));
  } catch {
    /* 非浏览器环境 */
  }
}

// ---------------------------------------------------------------------------
// 高级模式 props（M4）
// ---------------------------------------------------------------------------

/** 分组行控制（分组列事实源在宿主 URL；此处受控渲染 + 折叠交互） */
export interface DataTableGroupingCtl {
  /** 分组列 id（受控；来自 useResourceTable 的 grouping.columns / URL） */
  columns: string[];
  onChange?: (next: string[]) => void;
  /** 组头文案（缺省 `列: 值`） */
  labelFor?: (colId: string, value: unknown) => ReactNode;
}

/** 树形数据（region→zone 类）：getChildren 注入 table.options.getSubRows（复用 expanding） */
export interface DataTableTreeCtl<TData> {
  getChildren: (row: TData, index: number) => TData[] | undefined;
  getRowId?: (row: TData) => string;
}

/** 聚合（footer 行 + 分组行 chip 共用） */
export interface DataTableAggregate {
  field: string;
  fn: "sum" | "avg" | "count";
}

export interface InlineEditorProps<TData> {
  row: TData;
  rowId: string;
  columnId: string;
  value: unknown;
  isDirty: boolean;
  onCommit(value: unknown): void;
  onCancel(): void;
}

/** 行内编辑 changeSet（core useInlineEdit 实例由宿主持有；表内只管交互态） */
export interface DataTableInlineCtl<TData> {
  /** 可编辑字段（列 id） */
  fields: string[];
  /** useInlineEdit 返回值（getCell/commit/revert/dirtyCount） */
  ctl: UseInlineEditResult<TData>;
  /** 自定义编辑器（缺省 Input：Enter 提交 / Esc 取消 / blur 提交） */
  editor?: (props: InlineEditorProps<TData>) => ReactNode;
  /** 提交条文案 */
  label?: string;
}

export interface DataTableProps<TData extends RowData> {
  table: ListTable<TData>;
  /** 首列冻结（sticky left；通常配合 id 列） */
  stickyFirst?: boolean;
  /** 尾列冻结（sticky right；通常配合行操作列） */
  stickyLast?: boolean;
  /** 展开行（render prop；需配 expandColumn） */
  expandable?: { render: (row: TData) => ReactNode };
  /** 列偏好持久化 key（显隐/顺序/宽度/密度 → localStorage fc:cols:<key>） */
  preferencesKey?: string;
  /** 表格右上工具区附加内容 */
  toolbarExtra?: ReactNode;
  onRowClick?: (row: TData) => void;
  /* ---- M4 高级模式 ---- */
  /** 分组行（grouping by column + 折叠组） */
  grouping?: DataTableGroupingCtl;
  /** 树形展开（首列缩进 + 折叠钮；子行经 getSubRows 注入） */
  tree?: DataTableTreeCtl<TData>;
  /** 聚合行（footer 渲染；分组行上以 chip 形式附带） */
  aggregates?: DataTableAggregate[];
  /** 行内编辑 changeSet（双击单元格进入编辑态、脏高亮、底部提交/取消条） */
  inline?: DataTableInlineCtl<TData>;
  /** 虚拟化：true → 行数 ≥200 自动启；{threshold} 自定阈值 */
  virtual?: boolean | { threshold?: number };
  /** 移动端（<768px）卡片化：字段来自列定义 */
  mobile?: "cards";
}

/** 密度 → 行 padding（comfortable ≈ 行高 52px 基线，architecture.md §8） */
const densityCell: Record<TableDensity, string> = {
  comfortable: "py-4",
  compact: "py-1.5",
};
const densityHead: Record<TableDensity, string> = {
  comfortable: "h-12",
  compact: "h-9",
};
const densityEstimate: Record<TableDensity, number> = {
  comfortable: 53,
  compact: 37,
};

const DEFAULT_VIRTUAL_THRESHOLD = 200;

function formatAggregate(value: number, fn: DataTableAggregate["fn"]): string {
  if (fn === "count") return String(value);
  if (fn === "avg") return value.toFixed(1);
  return value.toLocaleString();
}

/**
 * 对行集合计算聚合：分组/树形行展开到叶子（getLeafRows 非空），
 * 本身就是叶子的行取自身（getLeafRows 对叶子行返回空数组 —— 实测）。
 */
export function computeAggregate<TData extends RowData>(
  rows: ReadonlyArray<{
    getLeafRows: () => ReadonlyArray<{ original: TData }>;
    original: TData;
  }>,
  agg: DataTableAggregate,
): number {
  const leaves = rows.flatMap((row) => {
    const sub = row.getLeafRows();
    return sub.length > 0 ? sub : [row];
  });
  const seen = new Set<string>();
  const values: number[] = [];
  for (const leaf of leaves) {
    const id = String((leaf.original as { id?: unknown })?.id ?? `#${values.length}`);
    if (seen.has(id)) continue;
    seen.add(id);
    const v = (leaf.original as Record<string, unknown>)[agg.field];
    if (typeof v === "number" && Number.isFinite(v)) values.push(v);
  }
  if (agg.fn === "count") return values.length;
  if (agg.fn === "avg") {
    return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
  }
  return values.reduce((a, b) => a + b, 0);
}

// ---------------------------------------------------------------------------
// DataTable
// ---------------------------------------------------------------------------

export function DataTable<TData extends RowData>({
  table,
  stickyFirst = false,
  stickyLast = false,
  expandable,
  preferencesKey,
  toolbarExtra,
  onRowClick,
  grouping,
  tree,
  aggregates,
  inline,
  virtual,
  mobile,
}: DataTableProps<TData>) {
  const [density, setDensity] = useState<TableDensity>("comfortable");
  const applying = useRef(false);
  const isMobileViewport = useIsMobile();

  // 树形：getSubRows/getRowId 注入 table options（useTable 每渲染合并宿主 options，
  // 但不覆盖未声明键 —— 注入值存活；行模型 memo 依赖 getSubRows 引用自动重算）
  useEffect(() => {
    if (!tree) return;
    table.setOptions((prev) => ({
      ...prev,
      getSubRows: (row: TData, index: number) => tree.getChildren(row, index) ?? undefined,
      ...(tree.getRowId
        ? { getRowId: (row: TData) => tree.getRowId?.(row) ?? String((row as { id?: unknown }).id) }
        : {}),
    }));
  }, [table, tree]);

  // 列偏好：载入（effect 内，SSR 安全）+ 订阅 atoms 持久化
  useEffect(() => {
    if (!preferencesKey) return;
    applying.current = true;
    const prefs = readPrefs(preferencesKey);
    if (prefs.density) setDensity(prefs.density);
    if (prefs.columnVisibility) table.setColumnVisibility(prefs.columnVisibility);
    if (prefs.columnOrder) table.setColumnOrder(prefs.columnOrder);
    if (prefs.columnSizing) table.setColumnSizing(prefs.columnSizing);
    applying.current = false;

    const persist = (): void => {
      if (applying.current) return;
      writePrefs(preferencesKey, {
        density,
        columnVisibility: table.state.columnVisibility,
        columnOrder: table.state.columnOrder,
        columnSizing: table.state.columnSizing,
      });
    };
    const unsubs: (() => void)[] = [];
    const add = (sub: unknown): void => {
      if (typeof sub === "function") unsubs.push(sub as () => void);
      else if (sub && typeof (sub as { unsubscribe?: () => void }).unsubscribe === "function") {
        unsubs.push((sub as { unsubscribe: () => void }).unsubscribe);
      }
    };
    add(table.atoms.columnVisibility?.subscribe(persist));
    add(table.atoms.columnOrder?.subscribe(persist));
    add(table.atoms.columnSizing?.subscribe(persist));
    return () => {
      for (const unsub of unsubs) unsub();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 载入只在 key/table 实例首次生效
  }, [preferencesKey, table]);

  const changeDensity = (next: TableDensity): void => {
    setDensity(next);
    if (preferencesKey) {
      writePrefs(preferencesKey, {
        ...readPrefs(preferencesKey),
        density: next,
      });
    }
  };

  const columns = table.getVisibleLeafColumns();
  const firstId = columns[0]?.id;
  const lastId = columns[columns.length - 1]?.id;
  const visibleCount = columns.length;

  const handleRowKeyDown = (
    event: React.KeyboardEvent<HTMLTableRowElement>,
    rowId: string,
  ): void => {
    if (event.key !== "Enter" || event.target !== event.currentTarget) return;
    const trigger = document.querySelector<HTMLElement>(`[data-row-actions-trigger="${rowId}"]`);
    if (trigger) {
      trigger.click();
      return;
    }
    if (expandable) {
      table.getRow(rowId)?.toggleExpanded();
    }
  };

  // -------------------------------------------------------------------------
  // 虚拟化判定（rows ≥ threshold 自动启）
  // -------------------------------------------------------------------------
  const rows = table.getRowModel().rows;
  const threshold =
    virtual === undefined
      ? Number.MAX_SAFE_INTEGER
      : typeof virtual === "object"
        ? (virtual.threshold ?? DEFAULT_VIRTUAL_THRESHOLD)
        : DEFAULT_VIRTUAL_THRESHOLD;
  const virtualOn = rows.length >= threshold && threshold > 0;
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: virtualOn ? rows.length : 0,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => densityEstimate[density],
    overscan: 12,
  });
  const virtualItems = virtualOn ? rowVirtualizer.getVirtualItems() : [];
  const paddingTop = virtualItems.length > 0 ? (virtualItems[0]?.start ?? 0) : 0;
  const paddingBottom = virtualOn
    ? rowVirtualizer.getTotalSize() - (virtualItems.at(-1)?.end ?? 0)
    : 0;

  // -------------------------------------------------------------------------
  // 聚合（footer + 分组行 chip）
  // -------------------------------------------------------------------------
  const aggregateByField = useMemo(() => {
    const map = new Map<string, DataTableAggregate>();
    for (const agg of aggregates ?? []) map.set(agg.field, agg);
    return map;
  }, [aggregates]);

  // -------------------------------------------------------------------------
  // 行内编辑交互态（正在编辑的单元格 = {rowId, columnId}；一次一格）
  // -------------------------------------------------------------------------
  const [editing, setEditing] = useState<{ rowId: string; columnId: string } | null>(null);
  const [committing, setCommitting] = useState(false);
  const inlineFields = useMemo(() => new Set(inline?.fields ?? []), [inline?.fields]);
  const inlineCommit = useCallback(async () => {
    if (!inline) return;
    setCommitting(true);
    try {
      await inline.ctl.commit();
    } finally {
      setCommitting(false);
      setEditing(null);
    }
  }, [inline]);

  const renderCell = (
    cell: Cell<ListTableFeatures, TData, unknown>,
    rowIndex: number,
  ): ReactNode => {
    const columnId = cell.column.id;
    const isStickyLeft = stickyFirst && columnId === firstId;
    const isStickyRight = stickyLast && columnId === lastId;
    const row = cell.row;
    const editable = inline !== undefined && inlineFields.has(columnId);
    const isEditing = editing !== null && editing.rowId === row.id && editing.columnId === columnId;
    const cellCtl = editable && inline ? inline.ctl.getCell(row.id, columnId) : undefined;
    const dirty = cellCtl?.isDirty ?? false;

    // 树形首列：折叠钮 + 缩进（rowIndex 即本行内单元格序）
    const treeCtl =
      tree && rowIndex === 0 && row.getCanExpand() ? (
        <button
          type="button"
          aria-label={row.getIsExpanded() ? "折叠子行" : "展开子行"}
          onClick={(e) => {
            e.stopPropagation();
            row.toggleExpanded();
          }}
          className="text-muted-foreground hover:text-foreground mr-1.5 inline-flex shrink-0 transition-colors"
        >
          <ChevronRight
            className={cn("size-4 transition-transform", row.getIsExpanded() && "rotate-90")}
          />
        </button>
      ) : tree && rowIndex === 0 ? (
        <span className="mr-5 inline-block shrink-0" aria-hidden />
      ) : null;

    let content: ReactNode;
    if (isEditing && cellCtl !== undefined) {
      content = (
        <InlineCellEditor
          row={row.original}
          rowId={row.id}
          columnId={columnId}
          value={cellCtl.value}
          isDirty={dirty}
          onCommit={(v) => {
            cellCtl?.set(v);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
          editor={inline?.editor}
        />
      );
    } else {
      content = <FlexRender cell={cell} />;
    }

    return (
      <TableCell
        key={cell.id}
        onDoubleClick={
          editable
            ? (e) => {
                e.stopPropagation();
                setEditing({ rowId: row.id, columnId });
              }
            : undefined
        }
        title={editable && !isEditing ? "双击编辑" : undefined}
        className={cn(
          densityCell[density],
          "[&>button]:cursor-default",
          // sticky 列必须不透明（否则下层列文字透出）；hover/选中态用与 TableRow 等效的实色
          isStickyLeft &&
            "sticky left-0 z-10 bg-background group-hover/row:bg-[color-mix(in_oklab,var(--muted)_50%,var(--background))] group-has-aria-expanded/row:bg-[color-mix(in_oklab,var(--muted)_50%,var(--background))] group-data-[state=selected]/row:bg-muted",
          isStickyRight &&
            "sticky right-0 z-10 bg-background group-hover/row:bg-[color-mix(in_oklab,var(--muted)_50%,var(--background))] group-has-aria-expanded/row:bg-[color-mix(in_oklab,var(--muted)_50%,var(--background))] group-data-[state=selected]/row:bg-muted",
          dirty && "bg-primary/10 ring-primary/30 ring-1 ring-inset",
          editable && !isEditing && "hover:bg-primary/5 cursor-text",
          rowIndex >= 0 && "align-middle",
        )}
      >
        <div className="flex min-w-0 items-center">
          {treeCtl}
          <span className="truncate">{content}</span>
        </div>
      </TableCell>
    );
  };

  const renderRow = (row: Row<ListTableFeatures, TData>, virtualIndex?: number): ReactNode => {
    // 分组行：整行横跨（折叠钮 + 组值 + 计数 + 聚合 chip）
    if (row.getIsGrouped()) {
      const colId = row.groupingColumnId ?? "";
      const label =
        grouping?.labelFor?.(colId, row.groupingValue) ??
        `${colId}: ${row.groupingValue === undefined ? "" : String(row.groupingValue)}`;
      const leafCount = row.getLeafRows().length;
      const chips = [...aggregateByField.values()];
      return (
        <TableRow
          key={row.id}
          className="bg-muted/50 hover:bg-muted/50 cursor-pointer"
          onClick={() => row.toggleExpanded()}
        >
          <TableCell colSpan={visibleCount} className="py-2.5">
            <span className="flex flex-wrap items-center gap-2">
              <ChevronRight
                className={cn(
                  "text-muted-foreground size-4 transition-transform",
                  row.getIsExpanded() && "rotate-90",
                )}
              />
              <span className="text-[13px] font-medium">{label}</span>
              <span className="text-muted-foreground text-xs tabular-nums">({leafCount} 行)</span>
              {chips.map((agg) => (
                <span
                  key={agg.field}
                  className="bg-background text-muted-foreground rounded-md border px-1.5 py-0.5 font-mono text-[11px] tabular-nums"
                >
                  {agg.fn}({agg.field}) ={" "}
                  {formatAggregate(computeAggregate(row.getLeafRows(), agg), agg.fn)}
                </span>
              ))}
            </span>
          </TableCell>
        </TableRow>
      );
    }

    return (
      <Fragment key={row.id}>
        <TableRow
          tabIndex={0}
          data-state={row.getIsSelected() ? "selected" : undefined}
          data-index={virtualIndex}
          ref={virtualIndex !== undefined ? rowVirtualizer.measureElement : undefined}
          className={cn(
            "group/row cursor-default",
            onRowClick && "cursor-pointer",
            expandable && "cursor-pointer",
          )}
          onClick={onRowClick ? () => onRowClick(row.original) : undefined}
          onKeyDown={(e) => handleRowKeyDown(e, row.id)}
        >
          {row.getVisibleCells().map((cell, i) => renderCell(cell, i))}
        </TableRow>
        {expandable && row.getIsExpanded() ? (
          <TableRow className="hover:bg-transparent">
            <TableCell colSpan={visibleCount} className="bg-muted/20 px-10 py-4">
              {expandable.render(row.original)}
            </TableCell>
          </TableRow>
        ) : null}
      </Fragment>
    );
  };

  // -------------------------------------------------------------------------
  // 移动端卡片化（mobile === 'cards' 且窄视口）
  // -------------------------------------------------------------------------
  if (mobile === "cards" && isMobileViewport) {
    return (
      <div className="flex flex-col gap-2" data-slot="data-table">
        <div className="flex items-center justify-end gap-2">
          {toolbarExtra}
          <DensityToggle density={density} onChange={changeDensity} />
          <ColumnsMenu table={table} />
        </div>
        <MobileCards table={table} rows={rows} inline={inline} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2" data-slot="data-table">
      <div className="flex items-center justify-end gap-2">
        {toolbarExtra}
        <DensityToggle density={density} onChange={changeDensity} />
        <ColumnsMenu table={table} />
      </div>
      <div
        ref={scrollRef}
        className={cn(
          "w-full overflow-x-auto rounded-lg border",
          virtualOn && "max-h-[70vh] overflow-y-auto",
        )}
      >
        <Table className="table-fixed">
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="bg-muted/40 hover:bg-muted/40">
                {headerGroup.headers.map((header) => {
                  const canSort = header.column.getCanSort();
                  const sorted = header.column.getIsSorted();
                  const isStickyLeft = stickyFirst && header.column.id === firstId;
                  const isStickyRight = stickyLast && header.column.id === lastId;
                  return (
                    <TableHead
                      key={header.id}
                      style={
                        // 仅显式声明 size 的列给固定宽（选择/展开/拖拽过的列）；其余交给
                        // 表格自动布局——无条件写 width 会把未声明列全部顶到 150px，造成
                        // 总宽溢出、尾列被 sticky 操作列遮住
                        header.column.columnDef.size !== undefined
                          ? { width: header.getSize() }
                          : undefined
                      }
                      className={cn(
                        densityHead[density],
                        "relative",
                        virtualOn && "sticky top-0 z-20",
                        isStickyLeft && "bg-muted/95 sticky left-0 z-20",
                        isStickyRight && "bg-muted/95 sticky right-0 z-20",
                      )}
                    >
                      {canSort ? (
                        <button
                          type="button"
                          className="group/sort inline-flex items-center gap-1 text-[13px] font-medium whitespace-nowrap"
                          onClick={header.column.getToggleSortingHandler()}
                        >
                          <FlexRender header={header} />
                          <span className="text-muted-foreground/60">
                            {sorted === "asc" ? (
                              <ArrowUp className="size-3" />
                            ) : sorted === "desc" ? (
                              <ArrowDown className="size-3" />
                            ) : (
                              <ArrowUpDown className="size-3 opacity-0 transition-opacity group-hover/sort:opacity-100" />
                            )}
                          </span>
                          {header.column.getSortIndex() > 0 ? (
                            <sub className="text-muted-foreground text-[10px]">
                              {header.column.getSortIndex() + 1}
                            </sub>
                          ) : null}
                        </button>
                      ) : (
                        <FlexRender header={header} />
                      )}
                      {header.column.getCanResize() ? (
                        <button
                          type="button"
                          aria-label="拖拽调整列宽"
                          className="absolute top-0 right-0 h-full w-1 cursor-col-resize touch-none select-none bg-border/0 transition-colors hover:bg-primary/40"
                          onMouseDown={header.getResizeHandler() as unknown as (e: unknown) => void}
                          onTouchStart={
                            header.getResizeHandler() as unknown as (e: unknown) => void
                          }
                        />
                      ) : null}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleCount} className="h-24 text-center">
                  <span className="text-muted-foreground text-[13px]">无数据</span>
                </TableCell>
              </TableRow>
            ) : virtualOn ? (
              <>
                {paddingTop > 0 ? <SpacerRow height={paddingTop} colSpan={visibleCount} /> : null}
                {virtualItems.map((vi) => {
                  const row = rows[vi.index];
                  return row === undefined ? null : renderRow(row, vi.index);
                })}
                {paddingBottom > 0 ? (
                  <SpacerRow height={paddingBottom} colSpan={visibleCount} />
                ) : null}
              </>
            ) : (
              rows.map((row) => renderRow(row))
            )}
          </TableBody>
          {aggregateByField.size > 0 ? (
            <TableFooter>
              <TableRow className="bg-muted/30 hover:bg-muted/30">
                {columns.map((column, i) => {
                  const agg = aggregateByField.get(column.id);
                  return (
                    <TableCell
                      key={column.id}
                      className={cn(
                        densityCell.compact,
                        "text-[13px]",
                        agg ? "font-mono tabular-nums" : "text-muted-foreground",
                      )}
                    >
                      {i === 0
                        ? `合计 · ${rows.length} 行`
                        : agg
                          ? formatAggregate(computeAggregate(rows, agg), agg.fn)
                          : ""}
                    </TableCell>
                  );
                })}
              </TableRow>
            </TableFooter>
          ) : null}
        </Table>
      </div>
      {inline && inline.ctl.dirtyCount > 0 ? (
        <InlineBar
          count={inline.ctl.dirtyCount}
          label={inline.label}
          pending={committing}
          onCommit={() => void inlineCommit()}
          onRevert={() => {
            setEditing(null);
            inline.ctl.revert();
          }}
        />
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 子组件
// ---------------------------------------------------------------------------

function SpacerRow({ height, colSpan }: { height: number; colSpan: number }) {
  return (
    <tr aria-hidden style={{ height }}>
      <td colSpan={colSpan} style={{ height, padding: 0, borderWidth: 0 }} />
    </tr>
  );
}

function InlineCellEditor<TData extends RowData>({
  row,
  rowId,
  columnId,
  value,
  isDirty,
  onCommit,
  onCancel,
  editor,
}: InlineEditorProps<TData> & {
  editor?: (props: InlineEditorProps<TData>) => ReactNode;
}) {
  if (editor) {
    return <>{editor({ row, rowId, columnId, value, isDirty, onCommit, onCancel })}</>;
  }
  const commitText = (text: string): void => {
    const num = Number(text);
    // 数字值（原值为 number）走数字转换，其余按字符串
    onCommit(typeof value === "number" && text !== "" && !Number.isNaN(num) ? num : text);
  };
  return (
    <Input
      autoFocus
      defaultValue={value === undefined || value === null ? "" : String(value)}
      className="h-7 w-full max-w-[10rem] font-mono text-xs"
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => commitText(e.currentTarget.value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") commitText(e.currentTarget.value);
        if (e.key === "Escape") onCancel();
      }}
    />
  );
}

/** 行内编辑提交/取消条（SelectionBar 式）；导出供自建行内编辑 UI 复用 */
export function InlineBar({
  count,
  label,
  pending,
  onCommit,
  onRevert,
}: {
  count: number;
  label?: string;
  pending: boolean;
  onCommit(): void;
  onRevert(): void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="行内编辑"
      data-slot="inline-bar"
      className="bg-primary/5 border-primary/20 sticky bottom-4 z-30 mx-auto flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 shadow-lg backdrop-blur"
    >
      <span className="text-primary text-[13px] font-medium tabular-nums">
        {label ?? "已修改"} {count} 处
      </span>
      <span className="bg-border h-4 w-px" aria-hidden />
      <Button size="sm" className="h-7" disabled={pending} onClick={onCommit}>
        {pending ? "提交中…" : "批量提交"}
      </Button>
      <Button size="sm" variant="ghost" className="h-7" disabled={pending} onClick={onRevert}>
        取消
      </Button>
    </div>
  );
}

/** 移动端卡片：每行一卡（label:value 来自可见列；跳过 __ 前缀 display 列） */
function MobileCards<TData extends RowData>({
  table,
  rows,
  inline,
}: {
  table: ListTable<TData>;
  rows: Row<ListTableFeatures, TData>[];
  inline?: DataTableInlineCtl<TData>;
}) {
  const visibleColumns = table.getVisibleLeafColumns();
  const dataColumns = visibleColumns.filter((c) => !c.id.startsWith("__"));
  const [editing, setEditing] = useState<{ rowId: string; columnId: string } | null>(null);

  if (rows.length === 0) {
    return <p className="text-muted-foreground py-10 text-center text-sm">无数据</p>;
  }

  return (
    <ul className="flex flex-col gap-2">
      {rows.map((row) => (
        <li key={row.id} className="bg-card rounded-xl border p-3.5">
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2">
            {row.getVisibleCells().map((cell) => {
              const columnId = cell.column.id;
              if (columnId.startsWith("__")) {
                return (
                  <div key={cell.id} className="col-span-2 self-start">
                    <FlexRender cell={cell} />
                  </div>
                );
              }
              const header = dataColumns.find((c) => c.id === columnId)?.id ?? columnId;
              const editable = inline?.fields.includes(columnId);
              const isEditing =
                editing !== null && editing.rowId === row.id && editing.columnId === columnId;
              const cellCtl = editable && inline ? inline.ctl.getCell(row.id, columnId) : undefined;
              return (
                <Fragment key={cell.id}>
                  <dt className="text-muted-foreground self-center text-xs font-medium tracking-wider uppercase">
                    {header}
                  </dt>
                  <dd
                    onDoubleClick={
                      editable ? () => setEditing({ rowId: row.id, columnId }) : undefined
                    }
                    className={cn(
                      "text-foreground text-sm",
                      cellCtl?.isDirty && "text-primary font-medium",
                    )}
                  >
                    {isEditing && cellCtl ? (
                      <InlineCellEditor
                        row={row.original}
                        rowId={row.id}
                        columnId={columnId}
                        value={cellCtl.value}
                        isDirty={cellCtl.isDirty ?? false}
                        onCommit={(v) => {
                          cellCtl?.set(v);
                          setEditing(null);
                        }}
                        onCancel={() => setEditing(null)}
                        editor={inline?.editor}
                      />
                    ) : (
                      <FlexRender cell={cell} />
                    )}
                  </dd>
                </Fragment>
              );
            })}
          </dl>
        </li>
      ))}
    </ul>
  );
}

function DensityToggle({
  density,
  onChange,
}: {
  density: TableDensity;
  onChange: (d: TableDensity) => void;
}) {
  return (
    <div className="bg-muted/40 inline-flex items-center rounded-lg p-0.5">
      <span className="sr-only">行密度</span>
      {(
        [
          ["comfortable", "舒适"],
          ["compact", "紧凑"],
        ] as const
      ).map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          aria-pressed={density === value}
          className={cn(
            "rounded-md px-2 py-1 text-xs transition-colors",
            density === value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function ColumnsMenu<TData extends RowData>({ table }: { table: ListTable<TData> }) {
  const columns = table.getAllLeafColumns().filter((c) => c.getCanHide());
  const order = table.state.columnOrder;
  const move = (id: string, dir: -1 | 1): void => {
    const current = order.length > 0 ? [...order] : columns.map((c) => c.id);
    const idx = current.indexOf(id);
    const target = idx + dir;
    if (idx < 0 || target < 0 || target >= current.length) return;
    const next = [...current];
    const [moved] = next.splice(idx, 1);
    if (moved) {
      next.splice(target, 0, moved);
      table.setColumnOrder(next);
    }
  };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" />}>
        <ChevronsUpDown data-icon="inline-start" />列
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel>显示列</DropdownMenuLabel>
        {columns.map((column) => (
          <div key={column.id} className="flex items-center">
            <DropdownMenuCheckboxItem
              className="flex-1"
              checked={column.getIsVisible()}
              onCheckedChange={column.getToggleVisibilityHandler()}
              closeOnClick={false}
            >
              {String(columnDefTitle(column.id))}
            </DropdownMenuCheckboxItem>
            <span className="flex items-center">
              <button
                type="button"
                aria-label="上移"
                className="text-muted-foreground hover:text-foreground px-1"
                onClick={(e) => {
                  e.preventDefault();
                  move(column.id, -1);
                }}
              >
                <ArrowUp className="size-3" />
              </button>
              <button
                type="button"
                aria-label="下移"
                className="text-muted-foreground hover:text-foreground px-1"
                onClick={(e) => {
                  e.preventDefault();
                  move(column.id, 1);
                }}
              >
                <ChevronDown className="size-3" />
              </button>
            </span>
          </div>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function columnDefTitle(id: string): string {
  return id.startsWith("__")
    ? id === "__select"
      ? "选择"
      : id === "__expand"
        ? "展开"
        : "操作"
    : id;
}
