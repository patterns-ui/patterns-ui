import type { ListColumnDef, ListColumnHelper, ListTable } from "@fleetly/ui-component-core/list";
import { FlexRender, type RowData } from "@tanstack/react-table";
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
import { Fragment, type ReactNode, useEffect, useRef, useState } from "react";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

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
  danger?: boolean;
  icon?: LucideIcon;
  run: (row: TData) => void | Promise<void>;
  separatorBefore?: boolean;
}

/** 行操作列：DropdownMenu（触发按钮带 data-row-actions-trigger，供键盘 Enter 打开） */
export function actionsColumn<TData extends RowData>(
  helper: ListColumnHelper<TData>,
  rowActions: (row: TData) => RowActionItem<TData>[],
  label = "操作",
): ListColumnDef<TData> {
  return helper.display({
    id: "__actions",
    enableSorting: false,
    enableHiding: false,
    size: 60,
    header: () => <span className="sr-only">{label}</span>,
    cell: ({ row, table }) => (
      <RowActionsMenu row={row} table={table as ListTable<TData>} rowActions={rowActions} />
    ),
  }) as ListColumnDef<TData>;
}

function RowActionsMenu<TData extends RowData>({
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
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            aria-label="行操作"
            data-row-actions-trigger={row.id}
            onClick={(e) => e.stopPropagation()}
          />
        }
      >
        <MoreHorizontal />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
        {items.map((item, i) => (
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
// DataTable
// ---------------------------------------------------------------------------

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
  /* ---- M4 高级模式接口预留（本阶段不实现） ---- */
  grouping?: unknown;
  tree?: { getChildren: (row: TData) => TData[] | undefined };
  aggregates?: { field: string; fn: "sum" | "avg" | "count" }[];
  inline?: unknown;
  virtual?: boolean;
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

export function DataTable<TData extends RowData>({
  table,
  stickyFirst = false,
  stickyLast = false,
  expandable,
  preferencesKey,
  toolbarExtra,
  onRowClick,
}: DataTableProps<TData>) {
  const [density, setDensity] = useState<TableDensity>("comfortable");
  const applying = useRef(false);

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

  return (
    <div className="flex flex-col gap-2" data-slot="data-table">
      <div className="flex items-center justify-end gap-2">
        {toolbarExtra}
        <DensityToggle density={density} onChange={changeDensity} />
        <ColumnsMenu table={table} />
      </div>
      <div className="w-full overflow-x-auto rounded-lg border">
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
                      style={{ width: header.getSize() }}
                      className={cn(
                        densityHead[density],
                        "relative",
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
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={visibleCount} className="h-24 text-center">
                  <span className="text-muted-foreground text-[13px]">无数据</span>
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <Fragment key={row.id}>
                  <TableRow
                    tabIndex={0}
                    data-state={row.getIsSelected() ? "selected" : undefined}
                    className={cn(
                      "group/row cursor-default",
                      onRowClick && "cursor-pointer",
                      expandable && "cursor-pointer",
                    )}
                    onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                    onKeyDown={(e) => handleRowKeyDown(e, row.id)}
                  >
                    {row.getVisibleCells().map((cell) => {
                      const isStickyLeft = stickyFirst && cell.column.id === firstId;
                      const isStickyRight = stickyLast && cell.column.id === lastId;
                      return (
                        <TableCell
                          key={cell.id}
                          className={cn(
                            densityCell[density],
                            "[&>button]:cursor-default",
                            isStickyLeft &&
                              "bg-background group-hover/row:bg-muted/50 sticky left-0 z-10",
                            isStickyRight &&
                              "bg-background group-hover/row:bg-muted/50 sticky right-0 z-10",
                          )}
                        >
                          <FlexRender cell={cell} />
                        </TableCell>
                      );
                    })}
                  </TableRow>
                  {expandable && row.getIsExpanded() ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={visibleCount} className="bg-muted/20 px-10 py-4">
                        {expandable.render(row.original)}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </Fragment>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
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
