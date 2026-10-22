/**
 * reference-select —— 关联选择（搜索触发 + 分页选项 + allowCreate 就地新建回选）。
 * 数据经 core createResource hooks（useList/useReferenceLabel）；blocks 不发裸请求。
 */

import type { ResourceOf } from "@patterns-ui/core/data";
import { type ReferenceSource, useReferenceLabel } from "@patterns-ui/core/reference";
import { cn } from "cn";
import { ChevronsUpDown, Plus, Search } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";

export interface ReferenceSelectProps<TData = Record<string, unknown>> {
  /** 关联资源（createResource 产物；TData 从 resource 推断） */
  resource: ResourceOf<TData> & ReferenceSource<TData>;
  value: string | string[] | undefined;
  onChange(v: string | string[]): void;
  multiple?: boolean;
  /** 预留：搜索词 → FilterTree（当前实现直接走 ListParams.search） */
  searchToFilter?: (q: string) => unknown;
  /** 搜索多少字符后开始请求，默认 0（始终取选项） */
  enableAfterChars?: number;
  /** 首屏选项数，默认 25 */
  initialPageSize?: number;
  /** 就地新建：渲染新建入口（如 form-dialog），onCreated(id) 回选 */
  allowCreate?: { render: (props: { onCreated: (id: string) => void }) => ReactNode };
  placeholder?: string;
  disabled?: boolean;
  /** 宿主可覆盖 label 取值（默认 name ?? title ?? id） */
  getIdLabel?: (row: TData) => string;
  className?: string;
}

/**
 * 关联选择：Popover 触发（展示已选 label，多选为 chips）+ 搜索输入（防抖 250ms）+
 * 选项列表（复选，多选）+ 加载更多（分页）+ allowCreate 就地新建回选。
 */
export function ReferenceSelect<TData = Record<string, unknown>>(
  props: ReferenceSelectProps<TData>,
) {
  const {
    resource,
    value,
    onChange,
    multiple = false,
    enableAfterChars = 0,
    initialPageSize = 25,
    allowCreate,
    placeholder,
    disabled,
    getIdLabel,
    className,
  } = props;

  const [open, setOpen] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<TData[]>([]);

  // 防抖搜索词
  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      setSearch(searchDraft);
      setPage(1);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchDraft, open]);

  const searchEnabled =
    search.trim().length >= enableAfterChars && (enableAfterChars > 0 || search.trim() !== "");
  const query = resource.useList({
    pageSize: initialPageSize,
    page,
    ...(searchEnabled ? { search: search.trim() } : {}),
    enabled: open,
  });
  const total = query.data?.total;

  // 页数据落盘：第 1 页替换（搜索/重开），后续页追加（按 id 去重）
  useEffect(() => {
    const next = query.data?.rows;
    if (next === undefined) return;
    setRows((prev) => {
      if (page === 1) return next;
      const seen = new Set(prev.map((r) => resource.getId(r)));
      return [...prev, ...next.filter((r) => !seen.has(resource.getId(r)))];
    });
  }, [query.data, page, resource]);

  const selected = useMemo(() => {
    if (value === undefined) return [];
    return Array.isArray(value) ? value : [value];
  }, [value]);

  const { labels } = useReferenceLabel(resource, selected, getIdLabel);

  const pick = (id: string) => {
    if (multiple) {
      onChange(selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id]);
    } else {
      onChange(id);
      setOpen(false);
    }
  };

  const triggerLabel =
    selected.length === 0 ? (
      <span className="text-muted-foreground">{placeholder ?? "选择关联…"}</span>
    ) : multiple ? (
      selected.map((id) => (
        <Badge key={id} variant="secondary" className="font-normal">
          {labels[id] ?? id}
        </Badge>
      ))
    ) : (
      <span className="truncate">{labels[selected[0] ?? ""] ?? selected[0]}</span>
    );

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <Popover
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (next) {
            setSearchDraft("");
            setSearch("");
            setPage(1);
          }
        }}
      >
        <PopoverTrigger
          render={
            <button
              type="button"
              disabled={disabled}
              aria-haspopup="listbox"
              aria-expanded={open}
              className="border-input dark:bg-input/30 flex min-h-8 w-full items-center gap-1.5 rounded-lg border px-2.5 py-1 text-left text-sm whitespace-nowrap transition-colors outline-none disabled:cursor-not-allowed disabled:opacity-50"
            >
              {triggerLabel}
              <ChevronsUpDown className="text-muted-foreground ml-auto size-4 shrink-0" />
            </button>
          }
        />
        <PopoverContent className="w-72 p-0" align="start">
          <div className="flex items-center gap-2 border-b px-2.5 py-2">
            <Search className="text-muted-foreground size-4 shrink-0" />
            <input
              value={searchDraft}
              placeholder="搜索…"
              className="placeholder:text-muted-foreground w-full bg-transparent text-sm outline-none"
              onChange={(e) => setSearchDraft(e.target.value)}
            />
          </div>
          <div className="max-h-64 overflow-y-auto p-1" role="listbox">
            {query.isPending ? (
              <div className="space-y-2 p-1">
                <Skeleton className="h-7 w-full" />
                <Skeleton className="h-7 w-full" />
                <Skeleton className="h-7 w-2/3" />
              </div>
            ) : rows.length === 0 ? (
              <p className="text-muted-foreground px-2 py-6 text-center text-sm">
                {search !== "" ? "没有匹配的选项" : "暂无可选项"}
              </p>
            ) : (
              rows.map((row) => {
                const id = resource.getId(row);
                const record = row as Record<string, unknown>;
                const label = getIdLabel
                  ? getIdLabel(row)
                  : String(record.name ?? record.title ?? id);
                return (
                  <Label
                    key={id}
                    className="hover:bg-muted/50 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm font-normal"
                  >
                    {multiple ? (
                      <Checkbox checked={selected.includes(id)} onCheckedChange={() => pick(id)} />
                    ) : (
                      <input
                        type="radio"
                        className="accent-primary size-3.5"
                        checked={selected.includes(id)}
                        onChange={() => pick(id)}
                      />
                    )}
                    <span className="truncate">{label}</span>
                  </Label>
                );
              })
            )}
          </div>
          {total !== undefined && rows.length < total ? (
            <div className="border-t p-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full"
                disabled={query.isFetching}
                onClick={() => setPage((n) => n + 1)}
              >
                加载更多（{rows.length}/{total}）
              </Button>
            </div>
          ) : null}
          {allowCreate ? (
            <div className="border-t p-2">
              {allowCreate.render({
                onCreated: (id) => {
                  pick(id);
                  void query.refetch();
                },
              })}
            </div>
          ) : null}
        </PopoverContent>
      </Popover>
      {multiple && selected.length > 0 ? (
        <p className="text-muted-foreground text-xs">已选 {selected.length} 项</p>
      ) : null}
    </div>
  );
}

export function ReferenceSelectCreateHint({ label = "新建" }: { label?: string }) {
  return (
    <Button type="button" variant="outline" size="sm" className="w-full">
      <Plus /> {label}
    </Button>
  );
}
