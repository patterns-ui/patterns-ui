import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { ArrowRight, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export interface ListPageProps {
  title: string;
  description?: string;
  /** 页头右侧动作区（新建按钮等） */
  actions?: ReactNode;
  /** 页头与过滤条之间的统计区（stat-strip 等） */
  lead?: ReactNode;
  /** 过滤区（filter-bar） */
  filter?: ReactNode;
  /** 过滤条与表格之间（selection-bar / new-items-banner / refresh-bar） */
  toolbar?: ReactNode;
  /** 表格区（async-state 包裹的 data-table 等） */
  body: ReactNode;
  /** 表格下（pagination-bar） */
  pagination?: ReactNode;
  /** 页尾附加槽（说明 / 引用等） */
  appendix?: ReactNode;
  className?: string;
}

export interface GridTileItem {
  /** 磁贴标题 */
  title: string;
  /** 跳转目标（Link to；与 onClick 二选一） */
  to?: string;
  onClick?(): void;
  /** 副标题 / 描述 */
  description?: string;
  /** 色块图标（Lucide 组件） */
  icon?: LucideIcon;
  /** 右上角徽标（如计数） */
  badge?: ReactNode;
}

export interface ListPageGridProps extends ListPageProps {
  /** 磁贴数据（grid 变体必填） */
  tiles: GridTileItem[];
  /** 每行磁贴数（默认 4；窄屏自动回落 1-2 列） */
  tileCols?: 2 | 3 | 4 | 5;
  /** 空态文案 */
  emptyText?: string;
}

/** 列表页模板（table 变体）：PageHeader + lead + FilterBar + AsyncState(DataTable) + PaginationBar + appendix */
export function ListPage({
  title,
  description,
  actions,
  lead,
  filter,
  toolbar,
  body,
  pagination,
  appendix,
  className,
}: ListPageProps) {
  return (
    <div className={cn("flex flex-col gap-5 pb-6", className)} data-slot="list-page">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
          {description ? <p className="text-muted-foreground text-[13px]">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </header>

      {lead}

      {filter}
      {toolbar}
      {body}
      {pagination}
      {appendix}
    </div>
  );
}

// ---------------------------------------------------------------------------
// grid 变体：磁贴墙（框式缝隙 bg-muted p-0.5、色块图标、hover 箭头）
// ---------------------------------------------------------------------------

const tileColsClass: Record<NonNullable<ListPageGridProps["tileCols"]>, string> = {
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-2 lg:grid-cols-3",
  4: "sm:grid-cols-2 lg:grid-cols-4",
  5: "sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5",
};

/** 列表页模板（grid 变体）：页头/过滤等槽复用 ListPage；body 位置渲染磁贴墙 */
export function ListPageGrid({
  tiles,
  tileCols = 4,
  emptyText = "暂无内容",
  body,
  ...pageProps
}: ListPageGridProps) {
  return (
    <ListPage
      {...pageProps}
      body={
        body ?? (
          <div
            className="bg-muted/60 grid grid-cols-1 gap-0.5 rounded-xl p-0.5"
            data-slot="list-page-grid"
          >
            {tiles.length === 0 ? (
              <p className="text-muted-foreground bg-background rounded-lg px-4 py-10 text-center text-[13px]">
                {emptyText}
              </p>
            ) : (
              <div className={cn("grid grid-cols-1 gap-0.5", tileColsClass[tileCols])}>
                {tiles.map((tile) => (
                  <GridTile key={tile.title} tile={tile} />
                ))}
              </div>
            )}
          </div>
        )
      }
    />
  );
}

function GridTile({ tile }: { tile: GridTileItem }) {
  const content = (
    <>
      <div className="flex items-start gap-3">
        {tile.icon ? (
          <span className="bg-primary/10 text-primary ring-primary/15 flex size-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset">
            <tile.icon className="size-4.5" />
          </span>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{tile.title}</span>
            {tile.badge}
          </div>
          {tile.description ? (
            <p className="text-muted-foreground mt-0.5 line-clamp-2 text-[13px]">
              {tile.description}
            </p>
          ) : null}
        </div>
        <ArrowRight className="text-muted-foreground/50 group-hover/tile:text-foreground mt-1 size-4 shrink-0 -translate-x-1 transition-all group-hover/tile:translate-x-0" />
      </div>
    </>
  );
  const className =
    "group/tile bg-background hover:bg-muted/40 focus-visible:ring-ring flex flex-col rounded-lg p-4 text-left outline-none transition-colors focus-visible:ring-2";
  if (tile.to !== undefined) {
    return (
      <Link to={tile.to as never} search className={className}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={tile.onClick} className={className}>
      {content}
    </button>
  );
}
