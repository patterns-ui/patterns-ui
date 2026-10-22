import type { FacetResult } from "@patterns-ui/core/data";
import type { FilterDef, FilterLeaf, FilterTree } from "@patterns-ui/core/filters";
import { isFilterLeaf } from "@patterns-ui/core/filters";
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

/** 当前字段的 in 叶子值集合（无则空） */
function inValues(tree: FilterTree | undefined, field: string): string[] {
  const leaf = collectLeaves(tree).find((l) => l.field === field && l.op === "in");
  return Array.isArray(leaf?.value) ? (leaf.value as string[]) : [];
}

function collectLeaves(tree: FilterTree | undefined): FilterLeaf[] {
  if (tree === undefined) return [];
  if (isFilterLeaf(tree)) return [tree];
  return tree.children.flatMap((c) => collectLeaves(c));
}

/** 写入字段的 in 叶子（替换既有 in/nin 同字段叶子） */
function withInLeaf(
  tree: FilterTree | undefined,
  leaf: FilterLeaf,
  field: string,
): FilterTree | undefined {
  const others = collectRemove(tree, field);
  if (leaf.value === undefined || (Array.isArray(leaf.value) && leaf.value.length === 0)) {
    return others;
  }
  if (others === undefined) return leaf;
  if (isFilterLeaf(others)) return { combinator: "and", children: [others, leaf] };
  return { combinator: others.combinator, children: [...others.children, leaf] };
}

function collectRemove(tree: FilterTree | undefined, field: string): FilterTree | undefined {
  if (tree === undefined) return undefined;
  if (isFilterLeaf(tree)) return tree.field === field ? undefined : tree;
  const children = tree.children
    .map((c) => collectRemove(c, field))
    .filter((c): c is FilterTree => c !== undefined);
  if (children.length === 0) return undefined;
  if (children.length === 1) return children[0];
  return { combinator: tree.combinator, children };
}

/** facet 侧栏：按字段分组多选 + 计数（勾选即写入 in 过滤） */
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
        const selected = inValues(list.state.filters, facet.field);
        const label = defs?.find((d) => d.field === facet.field)?.label ?? facet.field;
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
                      onCheckedChange={() => {
                        const next = checked
                          ? selected.filter((v) => v !== bucket.value)
                          : [...selected, bucket.value];
                        list.applyFilters(
                          withInLeaf(
                            list.state.filters,
                            { field: facet.field, op: "in", value: next },
                            facet.field,
                          ),
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
