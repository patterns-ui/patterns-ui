import { cn } from "cn";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export type PaginationMode = "offset" | "cursor" | "load-more";

export interface PaginationBarList {
  state: { page: number; pageSize: number };
  setPage: (n: number) => void;
  setPageSize: (n: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  loadMore: () => void;
  totalRows: number | undefined;
  /** cursor 模式：当前页是否还有下一页 */
  hasNextPage?: boolean;
  isLoading?: boolean;
}

export interface PaginationBarProps {
  list: PaginationBarList;
  mode: PaginationMode;
  pageSizeOptions?: number[];
  className?: string;
}

/** 分页条：offset 页码式 / cursor 前后式 / load-more 按钮 + 每页条数 + 总数 */
export function PaginationBar({
  list,
  mode,
  pageSizeOptions = [10, 20, 50, 100],
  className,
}: PaginationBarProps) {
  const { page, pageSize } = list.state;

  if (mode === "load-more") {
    const canLoadMore = list.hasNextPage !== false && list.totalRows !== undefined;
    return (
      <div
        className={cn("flex items-center justify-center pt-1", className)}
        data-slot="pagination-bar"
      >
        <Button
          variant="outline"
          onClick={() => list.loadMore()}
          disabled={!canLoadMore || list.isLoading}
        >
          {list.isLoading ? "加载中…" : "加载更多"}
        </Button>
        {list.totalRows !== undefined ? (
          <span className="text-muted-foreground ml-3 text-[13px] tabular-nums">
            已加载 {list.totalRows} 条
          </span>
        ) : null}
      </div>
    );
  }

  const total = list.totalRows;
  const pageCount = total !== undefined ? Math.max(1, Math.ceil(total / pageSize)) : undefined;
  const canPrev = page > 1;
  const canNext =
    list.hasNextPage !== undefined
      ? list.hasNextPage
      : pageCount !== undefined
        ? page < pageCount
        : false;
  const rangeStart = total !== undefined ? (page - 1) * pageSize + 1 : undefined;
  const rangeEnd = total !== undefined ? Math.min(page * pageSize, total) : undefined;

  return (
    <div
      className={cn("flex flex-wrap items-center justify-between gap-3 pt-1", className)}
      data-slot="pagination-bar"
    >
      <div className="text-muted-foreground flex items-center gap-4 text-[13px] tabular-nums">
        {total !== undefined ? (
          <span>
            第 {rangeStart}–{rangeEnd} 条，共 {total} 条
          </span>
        ) : (
          <span>第 {page} 页</span>
        )}
        <span className="flex items-center gap-1.5">
          每页
          <Select
            value={String(pageSize)}
            onValueChange={(v) => {
              if (v !== null) list.setPageSize(Number(v));
            }}
          >
            <SelectTrigger size="sm" className="w-17">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {pageSizeOptions.map((size) => (
                <SelectItem key={size} value={String(size)}>
                  {size}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          条
        </span>
      </div>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="上一页"
          disabled={!canPrev}
          onClick={() => list.prevPage()}
        >
          <ChevronLeft />
        </Button>
        {mode === "offset" && pageCount !== undefined ? (
          <PageWindow page={page} pageCount={pageCount} onPage={list.setPage} />
        ) : (
          <span className="text-muted-foreground px-2 text-[13px] tabular-nums">
            {page} / {pageCount ?? "?"}
          </span>
        )}
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="下一页"
          disabled={!canNext}
          onClick={() => list.nextPage()}
        >
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

/** 页码窗口：1 … n-1 n n+1 … N（最多 7 个按钮） */
function PageWindow({
  page,
  pageCount,
  onPage,
}: {
  page: number;
  pageCount: number;
  onPage: (n: number) => void;
}) {
  const pages = new Set<number>([1, pageCount, page - 1, page, page + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  const buttons: (number | "…")[] = [];
  for (const p of sorted) {
    if (buttons.length > 0 && p - (buttons[buttons.length - 1] as number) > 1) {
      buttons.push("…");
    }
    buttons.push(p);
  }
  return (
    <span className="flex items-center gap-0.5">
      {buttons.map((b, i) =>
        b === "…" ? (
          <span key={`gap-${i}`} className="text-muted-foreground px-1 text-xs">
            …
          </span>
        ) : (
          <Button
            key={b}
            variant={b === page ? "default" : "ghost"}
            size="icon-sm"
            aria-current={b === page ? "page" : undefined}
            onClick={() => onPage(b)}
            className="tabular-nums"
          >
            {b}
          </Button>
        ),
      )}
    </span>
  );
}
