import {
  defaultOpForDef,
  diffFilters,
  type FilterDef,
  type FilterLeaf,
  type FilterOperator,
  type FilterTree,
  filterLabel,
  flattenLeaves,
  isFilterNode,
  leafForField,
  opsForFilterDef,
  removeField,
  removeLeaf,
  valueControlForDef,
  withFieldLeaf,
} from "@patterns-ui/core/filters";
import { cn } from "cn";
import { ArrowDownUp, ChevronDown, Plus, Search, SlidersHorizontal, X } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { SavedViewsMenu } from "@/components/blocks/list/saved-views-menu/saved-views-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** filter-bar 系 blocks 消费的 useResourceTable 结果切片 */
export type FilterBarList = {
  searchDraft: string;
  setSearch: (v: string) => void;
  state: {
    search: string;
    filters: FilterTree | undefined;
    sort: unknown[];
    page: number;
    pageSize: number;
  };
  applyFilters: (tree?: FilterTree) => void;
  reset: () => void;
};

export interface FilterBarProps {
  list: FilterBarList;
  defs: FilterDef[];
  /** 展示高级（and/or 树）编辑器，默认 true */
  advanced?: boolean;
  /** saved-views-menu 渲染（传 resourceKey 启用） */
  savedViewsResourceKey?: string;
  onRefresh?: () => void;
  className?: string;
}

function formatLeafValue(leaf: FilterLeaf): string {
  if (Array.isArray(leaf.value)) {
    if (leaf.op === "between")
      return `${String(leaf.value[0] ?? "")}..${String(leaf.value[1] ?? "")}`;
    return leaf.value.map((v) => String(v)).join("、");
  }
  return String(leaf.value);
}

/** 已应用 chip 的运算符前缀：省略式渲染（缺省读作「字段: 值」），保持可读优先 */
const OP_CHIP_PREFIX: Partial<Record<FilterOperator, string>> = {
  ne: "≠",
  nin: "≠",
  contains: "~",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
};

/** chip 文本：`字段: 值` / `字段: ≠值` / `字段: a..b` / `字段: >值` / `字段: 有值|为空` */
function formatChip(leaf: FilterLeaf): string {
  if (leaf.op === "exists") return leaf.value === false ? "为空" : "有值";
  const value = formatLeafValue(leaf);
  return `${OP_CHIP_PREFIX[leaf.op] ?? ""}${value}`;
}

/** 编辑器下拉里的运算符选项（上下文是「字段 [运算符] 值」，用紧凑符号） */
const OP_LABELS: Partial<Record<FilterOperator, string>> = {
  eq: "=",
  ne: "≠",
  in: "∈",
  nin: "∉",
  contains: "~",
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
  between: "a..b",
  exists: "≠空",
};

/** 过滤工具条：搜索 + FilterDef 渲染 + 高级 and/or 编辑器 + 已应用 chips + saved-views + 刷新 */
export function FilterBar({
  list,
  defs,
  advanced = true,
  savedViewsResourceKey,
  onRefresh,
  className,
}: FilterBarProps) {
  const applied = list.state.filters;
  const leaves = useMemo(() => flattenLeaves(applied), [applied]);

  const applyLeaf = (leaf: FilterLeaf): void => {
    list.applyFilters(withFieldLeaf(list.state.filters, leaf));
  };
  const clearField = (field: string): void => {
    list.applyFilters(removeField(list.state.filters, field));
  };

  return (
    <div className={cn("flex flex-col gap-2", className)} data-slot="filter-bar">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            value={list.searchDraft}
            placeholder="搜索…（/ 聚焦）"
            data-slot="filter-bar-search"
            className="w-60 pl-8"
            onChange={(e) => list.setSearch((e.target as HTMLInputElement).value)}
          />
        </div>

        {defs.map((def) => (
          <FilterDefControl
            key={def.field}
            def={def}
            leaf={leafForField(applied, def.field)}
            onApply={applyLeaf}
            onClear={() => clearField(def.field)}
          />
        ))}

        {advanced ? (
          <AdvancedFilterEditor
            defs={defs}
            applied={applied}
            onApply={(tree) => list.applyFilters(tree)}
          />
        ) : null}

        <div className="ml-auto flex items-center gap-2">
          {savedViewsResourceKey ? <SavedViewsMenu resourceKey={savedViewsResourceKey} /> : null}
          {onRefresh ? (
            <Button variant="outline" size="sm" onClick={onRefresh}>
              刷新
            </Button>
          ) : null}
        </div>
      </div>

      {leaves.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5" data-slot="filter-chips">
          {leaves.map((leaf, i) => (
            <Badge key={`${leaf.field}-${i}`} variant="secondary" className="gap-1 font-normal">
              <span className="text-muted-foreground">{filterLabel(defs, leaf.field)}:</span>
              <span className="font-mono text-xs">{formatChip(leaf)}</span>
              <button
                type="button"
                aria-label={`移除 ${filterLabel(defs, leaf.field)} 过滤`}
                className="hover:bg-muted-foreground/20 -mr-1 rounded-full p-0.5"
                onClick={() => list.applyFilters(removeLeaf(list.state.filters, leaf))}
              >
                <X className="size-3" />
              </button>
            </Badge>
          ))}
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground ml-1 text-xs underline-offset-2 hover:underline"
            onClick={() => list.reset()}
          >
            重置全部
          </button>
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 单个 FilterDef 控件（变化即应用）
// ---------------------------------------------------------------------------

function FilterDefControl({
  def,
  leaf,
  onApply,
  onClear,
}: {
  def: FilterDef;
  leaf: FilterLeaf | undefined;
  onApply: (leaf: FilterLeaf) => void;
  onClear: () => void;
}) {
  const active = leaf !== undefined;
  const label = (
    <>
      {def.label}
      {active ? <span className="bg-primary size-1.5 rounded-full" aria-hidden /> : null}
    </>
  );

  if (def.kind === "select") {
    return (
      <Select
        value={leaf ? String(leaf.value) : null}
        onValueChange={(v) => {
          if (v === null || v === "__clear__") onClear();
          else onApply({ field: def.field, op: def.op ?? "eq", value: v });
        }}
      >
        <SelectTrigger
          size="sm"
          className={cn(active && "border-primary/50")}
          aria-label={def.label}
        >
          <SelectValue placeholder={label} />
        </SelectTrigger>
        <SelectContent>
          {leaf ? (
            <SelectItem value="__clear__">
              <span className="text-muted-foreground">清除</span>
            </SelectItem>
          ) : null}
          {def.options.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }

  if (def.kind === "multi-select") {
    const values = Array.isArray(leaf?.value) ? (leaf?.value as string[]) : [];
    const options = def.options === "facet" ? [] : def.options;
    return (
      <MultiSelectControl
        label={def.label}
        active={active}
        values={values}
        options={options}
        onApply={(next) => {
          if (next.length === 0) onClear();
          else onApply({ field: def.field, op: def.op ?? "in", value: next });
        }}
      >
        {label}
      </MultiSelectControl>
    );
  }

  // text / number / date-range / custom：Popover 编辑
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="outline" size="sm" className={cn(active && "border-primary/50")} />
        }
      >
        {label}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72">
        <LeafValueEditor def={def} leaf={leaf} onApply={onApply} onClear={onClear} autoFocus />
      </PopoverContent>
    </Popover>
  );
}

function MultiSelectControl({
  label,
  active,
  values,
  options,
  onApply,
  children,
}: {
  label: string;
  active: boolean;
  values: string[];
  options: { value: string; label: string }[];
  onApply: (next: string[]) => void;
  children: ReactNode;
}) {
  const summary =
    values.length === 0 ? null : values.length === 1 ? values[0] : `已选 ${values.length} 项`;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button variant="outline" size="sm" className={cn(active && "border-primary/50")} />
        }
      >
        {summary ? (
          <span className="flex items-center gap-1.5">
            <span className="text-muted-foreground">{label}</span>
            {summary}
          </span>
        ) : (
          children
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-48">
        {options.map((opt) => (
          <DropdownMenuCheckboxItem
            key={opt.value}
            checked={values.includes(opt.value)}
            onCheckedChange={(checked) => {
              onApply(checked ? [...values, opt.value] : values.filter((v) => v !== opt.value));
            }}
            closeOnClick={false}
          >
            {opt.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** 叶子值编辑（text/number/date-range；custom 由宿主经 children 注入） */
export function LeafValueEditor({
  def,
  leaf,
  onApply,
  onClear,
  autoFocus,
}: {
  def: FilterDef;
  leaf: FilterLeaf | undefined;
  onApply: (leaf: FilterLeaf) => void;
  onClear: () => void;
  autoFocus?: boolean;
}) {
  const [op, setOp] = useState<FilterOperator>(leaf?.op ?? defaultOpForDef(def));
  useEffect(() => {
    setOp(leaf?.op ?? defaultOpForDef(def));
  }, [leaf, def]);
  const [text, setText] = useState(leaf && !Array.isArray(leaf.value) ? String(leaf.value) : "");
  const [pair, setPair] = useState<[string, string]>(
    leaf && Array.isArray(leaf.value) && leaf.value.length === 2
      ? [String(leaf.value[0] ?? ""), String(leaf.value[1] ?? "")]
      : ["", ""],
  );
  useEffect(() => {
    setText(leaf && !Array.isArray(leaf.value) ? String(leaf.value) : "");
    setPair(
      leaf && Array.isArray(leaf.value) && leaf.value.length === 2
        ? [String(leaf.value[0] ?? ""), String(leaf.value[1] ?? "")]
        : ["", ""],
    );
  }, [leaf]);

  const apply = (): void => {
    if (def.kind === "date-range") {
      if (pair[0] === "" && pair[1] === "") onClear();
      else onApply({ field: def.field, op: "between", value: pair });
      return;
    }
    if (def.kind === "number") {
      if (op === "between") {
        if (pair[0] === "" && pair[1] === "") onClear();
        else
          onApply({
            field: def.field,
            op,
            value: [
              pair[0] === "" ? undefined : Number(pair[0]),
              pair[1] === "" ? undefined : Number(pair[1]),
            ],
          });
        return;
      }
      if (text === "") onClear();
      else onApply({ field: def.field, op, value: Number(text) });
      return;
    }
    if (text === "") onClear();
    else onApply({ field: def.field, op, value: text });
  };

  const numberOps: FilterOperator[] = ["eq", "gt", "gte", "lt", "lte", "between"];

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
        {def.label}
      </p>
      {def.kind === "date-range" ? (
        <div className="flex items-center gap-1.5">
          <Input
            type="date"
            value={pair[0]}
            onChange={(e) => setPair([(e.target as HTMLInputElement).value, pair[1]])}
          />
          <span className="text-muted-foreground text-xs">至</span>
          <Input
            type="date"
            value={pair[1]}
            onChange={(e) => setPair([pair[0], (e.target as HTMLInputElement).value])}
          />
        </div>
      ) : def.kind === "number" ? (
        <div className="flex items-center gap-1.5">
          <Select
            value={op}
            onValueChange={(v) => {
              if (v !== null) setOp(v as FilterOperator);
            }}
          >
            <SelectTrigger size="sm" className="w-20" aria-label={`${def.label} 比较方式`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {numberOps.map((o) => (
                <SelectItem key={o} value={o}>
                  {OP_LABELS[o] ?? o}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {op === "between" ? (
            <div className="flex flex-1 items-center gap-1">
              <Input
                type="number"
                value={pair[0]}
                placeholder="最小"
                onChange={(e) => setPair([(e.target as HTMLInputElement).value, pair[1]])}
              />
              <Input
                type="number"
                value={pair[1]}
                placeholder="最大"
                onChange={(e) => setPair([pair[0], (e.target as HTMLInputElement).value])}
              />
            </div>
          ) : (
            <Input
              type="number"
              className="flex-1"
              autoFocus={autoFocus}
              value={text}
              onChange={(e) => setText((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") apply();
              }}
            />
          )}
        </div>
      ) : (
        <Input
          autoFocus={autoFocus}
          value={text}
          placeholder={def.kind === "text" ? "包含关键字…" : "值"}
          onChange={(e) => setText((e.target as HTMLInputElement).value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") apply();
          }}
        />
      )}
      <div className="flex items-center justify-end gap-2">
        {leaf ? (
          <Button variant="ghost" size="xs" onClick={onClear}>
            清除
          </Button>
        ) : null}
        <Button size="xs" onClick={apply}>
          应用
        </Button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 高级 and/or 编辑器
// ---------------------------------------------------------------------------

function AdvancedFilterEditor({
  defs,
  applied,
  onApply,
}: {
  defs: FilterDef[];
  applied: FilterTree | undefined;
  onApply: (tree: FilterTree | undefined) => void;
}) {
  const [draft, setDraft] = useState<FilterTree | undefined>(applied);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (open) setDraft(applied);
  }, [open, applied]);

  const dirty = diffFilters(draft, applied);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="outline" size="sm" className={cn(dirty && "border-primary/50")} />}
      >
        <SlidersHorizontal data-icon="inline-start" />
        高级过滤
      </PopoverTrigger>
      <PopoverContent align="start" className="w-105">
        <div className="flex flex-col gap-2">
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wider uppercase">
            <ArrowDownUp className="size-3" />
            条件组合
          </p>
          <TreeEditor value={draft} onChange={setDraft} defs={defs} />
          <div className="flex items-center justify-between">
            <Button variant="ghost" size="xs" onClick={() => setDraft(undefined)}>
              清空
            </Button>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="xs" onClick={() => setOpen(false)}>
                取消
              </Button>
              <Button
                size="xs"
                disabled={!dirty}
                onClick={() => {
                  onApply(draft);
                  setOpen(false);
                }}
              >
                应用
              </Button>
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TreeEditor({
  value,
  onChange,
  defs,
}: {
  value: FilterTree | undefined;
  onChange: (v: FilterTree | undefined) => void;
  defs: FilterDef[];
}) {
  const root: FilterTree = value ?? { combinator: "and", children: [] };
  const isRootNode = isFilterNode(root);
  const combinator: "and" | "or" = isRootNode ? root.combinator : "and";
  const children: FilterTree[] = isRootNode ? root.children : root ? [root] : [];

  const setCombinator = (c: "and" | "or"): void => {
    if (children.length === 0) {
      onChange({ combinator: c, children: [] });
      return;
    }
    const only = children[0];
    if (children.length === 1 && only !== undefined) {
      onChange({ combinator: "and", children: [only] });
      return;
    }
    onChange({ combinator: c, children: [...children] });
  };

  const updateChild = (index: number, next: FilterTree | undefined): void => {
    const nextChildren = children.map((c, i) => (i === index ? next : c));
    commit(nextChildren);
  };

  const commit = (nextChildren: (FilterTree | undefined)[]): void => {
    const cleaned = nextChildren.filter((c): c is FilterTree => c !== undefined);
    if (cleaned.length === 0) onChange(undefined);
    else if (cleaned.length === 1) onChange(cleaned[0]);
    else onChange({ combinator, children: cleaned });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-xs">满足</span>
        <div className="bg-muted/50 inline-flex items-center rounded-md p-0.5">
          {(["and", "or"] as const).map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCombinator(c)}
              className={cn(
                "rounded px-2 py-0.5 text-xs",
                combinator === c
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground",
              )}
            >
              {c === "and" ? "全部（AND）" : "任一（OR）"}
            </button>
          ))}
        </div>
        <span className="text-muted-foreground text-xs">条件</span>
      </div>

      <div className="flex flex-col gap-1.5">
        {children.map((child, i) =>
          isFilterNode(child) ? (
            <div key={i} className="border-border/70 rounded-lg border p-2">
              <TreeEditor value={child} onChange={(next) => updateChild(i, next)} defs={defs} />
            </div>
          ) : (
            <LeafRow
              key={`${child.field}-${i}`}
              leaf={child}
              defs={defs}
              onChange={(next) => updateChild(i, next)}
            />
          ),
        )}
      </div>

      <div className="flex items-center gap-2">
        <AddLeafButton defs={defs} onAdd={(leaf) => commit([...children, leaf])} />
        <Button
          variant="ghost"
          size="xs"
          onClick={() => commit([...children, { combinator: "and", children: [] }])}
        >
          <Plus data-icon="inline-start" />
          条件组
        </Button>
      </div>
    </div>
  );
}

function LeafRow({
  leaf,
  defs,
  onChange,
}: {
  leaf: FilterLeaf;
  defs: FilterDef[];
  onChange: (next: FilterTree | undefined) => void;
}) {
  const def = defs.find((d) => d.field === leaf.field) ?? defs[0];
  const ops: FilterOperator[] = opsForFilterDef(def);

  return (
    <div className="bg-muted/30 flex flex-wrap items-center gap-1.5 rounded-md border px-2 py-1.5">
      <Select
        value={leaf.field}
        onValueChange={(field) => {
          if (field === null) return;
          const nextDef = defs.find((d) => d.field === field);
          onChange({ field, op: nextDef ? defaultOpForDef(nextDef) : leaf.op, value: "" });
        }}
      >
        <SelectTrigger size="sm" className="w-28" aria-label="过滤字段">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {defs.map((d) => (
            <SelectItem key={d.field} value={d.field}>
              {d.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select
        value={leaf.op}
        onValueChange={(op) => {
          if (op !== null) onChange({ ...leaf, op: op as FilterOperator });
        }}
      >
        <SelectTrigger size="sm" className="w-20" aria-label="比较操作符">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {ops.map((op) => (
            <SelectItem key={op} value={op}>
              {OP_LABELS[op] ?? op}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="min-w-0 flex-1">
        <LeafValueEditorInline leaf={leaf} def={def} onChange={onChange} />
      </span>
      <button
        type="button"
        aria-label="移除条件"
        className="text-muted-foreground hover:text-status-danger rounded p-1"
        onClick={() => onChange(undefined)}
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}

function LeafValueEditorInline({
  leaf,
  def,
  onChange,
}: {
  leaf: FilterLeaf;
  def: FilterDef | undefined;
  onChange: (next: FilterTree | undefined) => void;
}) {
  // 控件形态推断走 core/filters 字段级 API（valueControlForDef）；JSX 留在 block 层
  const control = valueControlForDef(def, leaf.op);
  if (control === "option" && def?.kind === "select") {
    return (
      <Select
        value={String(leaf.value ?? "")}
        onValueChange={(v) => {
          if (v !== null) onChange({ ...leaf, value: v });
        }}
      >
        <SelectTrigger size="sm" className="w-full" aria-label="条件值">
          <SelectValue placeholder="选择值" />
        </SelectTrigger>
        <SelectContent>
          {def.options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (control === "options" && def?.kind === "multi-select") {
    const options = def.options === "facet" ? [] : def.options;
    const values = Array.isArray(leaf.value) ? (leaf.value as string[]) : [];
    return (
      <DropdownMenu>
        <DropdownMenuTrigger
          render={<Button variant="outline" size="sm" className="w-full justify-start" />}
        >
          {values.length > 0 ? values.join("、") : "选择值"}
          <ChevronDown className="ml-auto" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {options.map((o) => (
            <DropdownMenuCheckboxItem
              key={o.value}
              checked={values.includes(o.value)}
              onCheckedChange={(checked) =>
                onChange({
                  ...leaf,
                  value: checked ? [...values, o.value] : values.filter((v) => v !== o.value),
                })
              }
              closeOnClick={false}
            >
              {o.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  }
  if (control === "range") {
    const pair =
      Array.isArray(leaf.value) && leaf.value.length === 2
        ? [String(leaf.value[0] ?? ""), String(leaf.value[1] ?? "")]
        : ["", ""];
    return (
      <span className="flex w-full items-center gap-1">
        <Input
          type={def?.kind === "date-range" ? "date" : "number"}
          className="h-7"
          value={pair[0]}
          onChange={(e) =>
            onChange({ ...leaf, value: [(e.target as HTMLInputElement).value, pair[1]] })
          }
        />
        <Input
          type={def?.kind === "date-range" ? "date" : "number"}
          className="h-7"
          value={pair[1]}
          onChange={(e) =>
            onChange({ ...leaf, value: [pair[0], (e.target as HTMLInputElement).value] })
          }
        />
      </span>
    );
  }
  return (
    <Input
      className="h-7"
      value={
        Array.isArray(leaf.value) ? leaf.value.map(String).join(",") : String(leaf.value ?? "")
      }
      placeholder="值"
      onChange={(e) => onChange({ ...leaf, value: (e.target as HTMLInputElement).value })}
    />
  );
}

function AddLeafButton({ defs, onAdd }: { defs: FilterDef[]; onAdd: (leaf: FilterLeaf) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="xs" />}>
        <Plus data-icon="inline-start" />
        条件
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {defs.map((d) => (
          <DropdownMenuCheckboxItem
            key={d.field}
            checked={false}
            onCheckedChange={() => onAdd({ field: d.field, op: defaultOpForDef(d), value: "" })}
            closeOnClick={false}
          >
            {d.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
