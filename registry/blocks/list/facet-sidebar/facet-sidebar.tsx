import type { FacetResult } from "@patterns-ui/core/data";
import {
  type FilterDef,
  type FilterTree,
  filterLabel,
  inValuesForField,
  removeField,
  withFieldLeaf,
} from "@patterns-ui/core/filters";
import { cn } from "cn";
import { Checkbox } from "@/components/ui/checkbox";

export interface FacetSidebarList {
  state: { filters: FilterTree | undefined };
  applyFilters: (tree?: FilterTree) => void;
}

export interface FacetSidebarProps {
  facetData: FacetResult[] | undefined;
  list: FacetSidebarList;
  /** facet 字段 → 展示名（缺省用字段名） */
  defs?: FilterDef[];
  className?: string;
}

/**
 * facet 侧栏：按字段分组多选 + 计数（勾选即写入 in 过滤）。
 * 字段级读取/写入（in 值集合、同字段叶子替换/移除）走 core/filters 字段级 API（M6-D 下沉）。
 */
export function FacetSidebar({ facetData, list, defs, className }: FacetSidebarProps) {
  if (facetData === undefined || facetData.length === 0) {
    return (
      <div className={cn("w-52 shrink-0", className)} data-slot="facet-sidebar" aria-busy="true">
        <div className="text-muted-foreground px-1 text-xs">facet 加载中…</div>
      </div>
    );
  }
  return (
    <div className={cn("w-52 shrink-0 space-y-5", className)} data-slot="facet-sidebar">
      {facetData.map((facet) => {
        const selected = inValuesForField(list.state.filters, facet.field);
        const label = defs ? filterLabel(defs, facet.field) : facet.field;
        return (
          <div key={facet.field} className="space-y-1.5">
            <p className="text-muted-foreground px-1 text-xs font-medium tracking-wider uppercase">
              {label}
            </p>
            <div className="space-y-0.5">
              {facet.buckets.map((bucket) => {
                const checked = selected.includes(bucket.value);
                return (
                  <span
                    key={bucket.value}
                    className="hover:bg-muted/50 flex items-center gap-2 rounded-md px-1 py-1 text-[13px]"
                  >
                    <Checkbox
                      checked={checked}
                      aria-label={`${label}: ${bucket.value}`}
                      onCheckedChange={() => {
                        const next = checked
                          ? selected.filter((v) => v !== bucket.value)
                          : [...selected, bucket.value];
                        // 空选集 → 移除字段叶子；否则替换写入 in 叶子
                        list.applyFilters(
                          next.length === 0
                            ? removeField(list.state.filters, facet.field)
                            : withFieldLeaf(list.state.filters, {
                                field: facet.field,
                                op: "in",
                                value: next,
                              }),
                        );
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate">{bucket.value}</span>
                    <span className="text-muted-foreground tabular-nums text-xs">
                      {bucket.count}
                    </span>
                  </span>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
