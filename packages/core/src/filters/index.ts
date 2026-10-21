/**
 * core/filters —— 过滤模型（docs/core-api.md §2）。
 *
 * FilterTree 是过滤器唯一事实形态（URL 编解码、列表请求、客户端求值共用）：
 *  - flat 模式（field 一参、多值逗号、范围 `..`）覆盖「单叶子 / and 平铺且 field 唯一」；
 *  - 树模式（含 or / 嵌套 / 同 field 多叶子）整体编码进 `f` 参数（encodeURIComponent JSON）。
 * contains 大小写不敏感；between 支持数值与日期（ISO 字符串按时间戳比较）。
 */
import { z } from "zod";

// ---------------------------------------------------------------------------
// 类型（docs/core-api.md §1.1 / §2）
// ---------------------------------------------------------------------------

export type SortDirection = "asc" | "desc";

export interface SortSpec {
  field: string;
  direction: SortDirection;
}

export type FilterOperator =
  | "eq"
  | "ne"
  | "in"
  | "nin"
  | "contains"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "between"
  | "exists";

export interface FilterLeaf {
  field: string;
  op: FilterOperator;
  /** between: [min, max]；in/nin: unknown[]；日期为 ISO 字符串 */
  value: unknown;
}

export interface FilterNode {
  combinator: "and" | "or";
  children: FilterTree[];
}

export type FilterTree = FilterLeaf | FilterNode;

export function isFilterNode(tree: FilterTree): tree is FilterNode {
  return "children" in tree && Array.isArray((tree as FilterNode).children);
}

export function isFilterLeaf(tree: FilterTree): tree is FilterLeaf {
  return "field" in tree && "op" in tree;
}

// ---------------------------------------------------------------------------
// FilterDef（UI 声明）
// ---------------------------------------------------------------------------

export interface FilterDefBase {
  field: string;
  label: string;
  /** server=false → 客户端求值（client 模式列表） */
  server?: boolean;
}

export interface SelectFilterDef extends FilterDefBase {
  kind: "select";
  op?: FilterOperator; // 默认 'eq'
  options: { value: string; label: string }[];
}

export interface MultiSelectFilterDef extends FilterDefBase {
  kind: "multi-select";
  op?: FilterOperator; // 默认 'in'
  options: { value: string; label: string }[] | "facet"; // 'facet' → 选项与计数来自 Page.facets
}

export interface TextFilterDef extends FilterDefBase {
  kind: "text";
  op?: FilterOperator; // 默认 'contains'
}

export interface NumberFilterDef extends FilterDefBase {
  kind: "number";
  op?: "eq" | "gt" | "gte" | "lt" | "lte" | "between";
}

export interface DateRangeFilterDef extends FilterDefBase {
  kind: "date-range"; // between [from, to]
}

export interface CustomFilterDef extends FilterDefBase {
  kind: "custom";
  encode: (value: unknown) => string;
  decode: (raw: string) => unknown;
  toFilter: (value: unknown) => FilterTree;
  defaultValue?: unknown;
}

export type FilterDef =
  | SelectFilterDef
  | MultiSelectFilterDef
  | TextFilterDef
  | NumberFilterDef
  | DateRangeFilterDef
  | CustomFilterDef;

export function defaultOpForDef(def: FilterDef): FilterOperator {
  switch (def.kind) {
    case "select":
      return def.op ?? "eq";
    case "multi-select":
      return def.op ?? "in";
    case "text":
      return def.op ?? "contains";
    case "number":
      return def.op ?? "eq";
    case "date-range":
      return "between";
    default:
      return "eq";
  }
}

// ---------------------------------------------------------------------------
// 客户端求值器
// ---------------------------------------------------------------------------

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}([T ].*)?$/;

function getByPath(row: unknown, field: string): unknown {
  return field.split(".").reduce<unknown>((acc, key) => {
    if (acc !== null && typeof acc === "object") {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, row);
}

/** 数值或日期统一转可比较数值；不可比时返回 undefined */
function comparable(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "string") {
    if (ISO_DATE_RE.test(v)) {
      const t = Date.parse(v.includes("T") || v.includes(" ") ? v : `${v}T00:00:00`);
      return Number.isNaN(t) ? undefined : t;
    }
    const n = Number(v);
    if (v.trim() !== "" && Number.isFinite(n)) return n;
  }
  return undefined;
}

function looseEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  const ca = comparable(a);
  const cb = comparable(b);
  if (ca !== undefined && cb !== undefined) return ca === cb;
  return String(a) === String(b);
}

/** 叶子求值：contains 大小写不敏感；between 数值与日期；in/nin 数组；日期按时间戳 */
export function evaluateLeaf<T>(row: T, leaf: FilterLeaf): boolean {
  const actual = getByPath(row, leaf.field);
  const expected = leaf.value;
  switch (leaf.op) {
    case "eq":
      return looseEq(actual, expected);
    case "ne":
      return !looseEq(actual, expected);
    case "in": {
      const list = Array.isArray(expected) ? expected : [expected];
      return list.some((v) => looseEq(actual, v));
    }
    case "nin": {
      const list = Array.isArray(expected) ? expected : [expected];
      return !list.some((v) => looseEq(actual, v));
    }
    case "contains": {
      if (actual === undefined || actual === null) return false;
      if (Array.isArray(actual)) {
        return actual.some((v) => String(v).toLowerCase().includes(String(expected).toLowerCase()));
      }
      return String(actual).toLowerCase().includes(String(expected).toLowerCase());
    }
    case "gt":
    case "gte":
    case "lt":
    case "lte": {
      const a = comparable(actual);
      const b = comparable(expected);
      if (a === undefined || b === undefined) {
        // 字符串字典序兜底
        const sa = String(actual ?? "");
        const sb = String(expected ?? "");
        if (leaf.op === "gt") return sa > sb;
        if (leaf.op === "gte") return sa >= sb;
        if (leaf.op === "lt") return sa < sb;
        return sa <= sb;
      }
      if (leaf.op === "gt") return a > b;
      if (leaf.op === "gte") return a >= b;
      if (leaf.op === "lt") return a < b;
      return a <= b;
    }
    case "between": {
      const pair = Array.isArray(expected) ? expected : [undefined, undefined];
      const a = comparable(actual);
      const lo = comparable(pair[0]);
      const hi = comparable(pair[1]);
      if (a === undefined) return false;
      if (lo !== undefined && a < lo) return false;
      if (hi !== undefined && a > hi) return false;
      return true;
    }
    case "exists":
      return expected === true || expected === undefined
        ? actual !== undefined && actual !== null
        : actual === undefined || actual === null;
    default:
      return true;
  }
}

export function evaluateTree<T>(row: T, tree: FilterTree | undefined): boolean {
  if (tree === undefined) return true;
  if (isFilterNode(tree)) {
    const children = tree.children.filter((c) => c !== undefined && c !== null);
    if (children.length === 0) return true;
    return tree.combinator === "or"
      ? children.some((child) => evaluateTree(row, child))
      : children.every((child) => evaluateTree(row, child));
  }
  return evaluateLeaf(row, tree);
}

/** 客户端求值（client 模式 / server=false 的字段整体走客户端） */
export function applyFilterTree<T>(
  rows: T[],
  tree: FilterTree | undefined,
  _defs: FilterDef[] = [],
): T[] {
  void _defs; // defs 保留位（未来用于 server=false 单字段分流）；当前整树客户端求值
  if (tree === undefined) return rows;
  return rows.filter((row) => evaluateTree(row, tree));
}

// ---------------------------------------------------------------------------
// 树操作 helper（chips / 编辑器用）
// ---------------------------------------------------------------------------

/** 展开树中的全部叶子（深度优先，保持出现顺序） */
export function flattenLeaves(tree: FilterTree | undefined): FilterLeaf[] {
  if (tree === undefined) return [];
  if (isFilterLeaf(tree)) return [tree];
  return tree.children.flatMap((child) => flattenLeaves(child));
}

function leafEquals(a: FilterLeaf, b: FilterLeaf): boolean {
  return (
    a.field === b.field && a.op === b.op && JSON.stringify(a.value) === JSON.stringify(b.value)
  );
}

/** 从树中移除第一个相等的叶子；返回新树（可能为 undefined） */
export function removeLeaf(tree: FilterTree | undefined, leaf: FilterLeaf): FilterTree | undefined {
  if (tree === undefined) return undefined;
  if (isFilterLeaf(tree)) return leafEquals(tree, leaf) ? undefined : tree;
  const children = tree.children
    .map((child) => removeLeaf(child, leaf))
    .filter((c): c is FilterTree => c !== undefined);
  if (children.length === 0) return undefined;
  if (children.length === 1) return children[0];
  return { combinator: tree.combinator, children };
}

/** and 组合两棵树（permanentFilters 合并用） */
export function andTrees(
  a: FilterTree | undefined,
  b: FilterTree | undefined,
): FilterTree | undefined {
  if (a === undefined) return b;
  if (b === undefined) return a;
  return { combinator: "and", children: [a, b] };
}

/** 规范化序列化（children 排序，消除顺序差异），用于 diffFilters */
function canonical(tree: FilterTree | undefined): string | undefined {
  if (tree === undefined) return undefined;
  if (isFilterLeaf(tree)) {
    return JSON.stringify([tree.field, tree.op, tree.value === undefined ? null : tree.value]);
  }
  const children = tree.children
    .map((c) => canonical(c))
    .filter((s): s is string => s !== undefined)
    .sort();
  return JSON.stringify([tree.combinator, children]);
}

/** 草稿/应用分离的纯逻辑：结构（忽略 children 顺序）是否不一致 */
export function diffFilters(
  draft: FilterTree | undefined,
  applied: FilterTree | undefined,
): boolean {
  return canonical(draft) !== canonical(applied);
}

// ---------------------------------------------------------------------------
// URL 编解码（flat 优先；树模式进 f 参数）
// ---------------------------------------------------------------------------

function encodeScalar(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined;
  if (Array.isArray(v)) return v.length > 0 ? v.map((x) => String(x)).join(",") : undefined;
  return String(v);
}

/**
 * 判断能否走 flat 模式：单叶子；或 and 根、全部叶子、field 无重复。
 * （or / 嵌套 / 同 field 多叶子 → 高级模式）
 */
export function canFlatten(tree: FilterTree): boolean {
  if (isFilterLeaf(tree)) return true;
  if (tree.combinator !== "and") return false;
  const fields = new Set<string>();
  for (const child of tree.children) {
    if (child === undefined || isFilterNode(child)) return false;
    if (fields.has(child.field)) return false;
    fields.add(child.field);
  }
  return true;
}

function defByField(defs: FilterDef[]): Map<string, FilterDef> {
  return new Map(defs.map((def) => [def.field, def]));
}

/** 最小化树：剔除空节点、塌缩单孩子节点（f 参数 payload 更短可读） */
export function minimalTree(tree: FilterTree): FilterTree | undefined {
  if (isFilterLeaf(tree)) return tree;
  const children = tree.children
    .map((c) => (c === undefined || c === null ? undefined : minimalTree(c)))
    .filter((c): c is FilterTree => c !== undefined);
  if (children.length === 0) return undefined;
  if (children.length === 1) return children[0];
  return { combinator: tree.combinator, children };
}

/**
 * 过滤树 → URL 参数（值均为字符串；多值 `,` 连接、范围 `..`、树模式 `f`=JSON）。
 * 调用方负责把 `f` 的 JSON 字符串 encode 后写入最终 URL（路由层 search 对象原样传即可）。
 */
export function encodeFiltersToParams(
  tree: FilterTree | undefined,
  defs: FilterDef[] = [],
): Record<string, string> {
  if (tree === undefined) return {};
  if (!canFlatten(tree)) {
    return { f: JSON.stringify(minimalTree(tree)) };
  }
  const byField = defByField(defs);
  const params: Record<string, string> = {};
  for (const leaf of flattenLeaves(tree)) {
    const def = byField.get(leaf.field);
    if (def?.kind === "custom") {
      const encoded = def.encode(leaf.value);
      if (encoded !== undefined && encoded !== "") params[leaf.field] = encoded;
      continue;
    }
    if (leaf.op === "between" && Array.isArray(leaf.value)) {
      const [lo, hi] = leaf.value;
      const loS = lo === undefined || lo === null || lo === "" ? "" : String(lo);
      const hiS = hi === undefined || hi === null || hi === "" ? "" : String(hi);
      if (loS !== "" || hiS !== "") params[leaf.field] = `${loS}..${hiS}`;
      continue;
    }
    const scalar = encodeScalar(leaf.value);
    if (scalar !== undefined && scalar !== "") params[leaf.field] = scalar;
  }
  return params;
}

const filterValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(filterValueSchema)]),
);

const OPS = [
  "eq",
  "ne",
  "in",
  "nin",
  "contains",
  "gt",
  "gte",
  "lt",
  "lte",
  "between",
  "exists",
] as const;

/** f 参数的 zod 兜底校验（递归树）；坏值整体丢弃（catch → undefined），不中断导航 */
export const filterTreeSchema: z.ZodType<FilterTree | undefined> = z.lazy(() =>
  z.union([
    z.object({ field: z.string(), op: z.enum(OPS), value: filterValueSchema.optional() }),
    z.object({ combinator: z.enum(["and", "or"]), children: z.array(filterTreeSchema).catch([]) }),
  ]),
) as z.ZodType<FilterTree | undefined>;

function parseTypedValue(def: FilterDef | undefined, raw: string): unknown {
  if (def?.kind === "custom") return def.decode(raw);
  if (raw.includes("..")) {
    const [lo, hi] = raw.split("..", 2);
    if (def?.kind === "number") {
      const loN = Number(lo);
      const hiN = Number(hi);
      return [
        lo === "" ? undefined : Number.isFinite(loN) ? loN : lo,
        hi === "" ? undefined : Number.isFinite(hiN) ? hiN : hi,
      ];
    }
    return [lo, hi];
  }
  if (def?.kind === "number") {
    const n = Number(raw);
    return Number.isFinite(n) ? n : raw;
  }
  if (raw.includes(",")) {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "");
  }
  return raw;
}

/**
 * URL search（已解析对象）→ FilterTree。f 参数优先；否则按 defs 拼平铺叶子。
 * f 坏值（非 JSON / 不合 schema）静默丢弃；flat 值按 def 归型（number / 数组 / 区间）。
 */
export function decodeFiltersFromParams(
  params: Record<string, unknown>,
  defs: FilterDef[] = [],
): FilterTree | undefined {
  const f = params.f;
  if (typeof f === "string" && f.trim() !== "") {
    try {
      const parsed: unknown = JSON.parse(f);
      const validated = filterTreeSchema.parse(parsed);
      return validated === undefined ? undefined : minimalTree(validated as FilterTree);
    } catch {
      return undefined;
    }
  }
  const leaves: FilterLeaf[] = [];
  for (const def of defs) {
    const raw = params[def.field];
    if (typeof raw !== "string" || raw === "") continue;
    if (def.kind === "custom") {
      const value = def.decode(raw);
      const sub = minimalTree(def.toFilter(value));
      if (sub !== undefined) {
        if (isFilterLeaf(sub)) leaves.push(sub);
        else leaves.push(...flattenLeaves(sub));
      }
      continue;
    }
    const value = parseTypedValue(def, raw);
    if (value === undefined || value === "" || (Array.isArray(value) && value.length === 0)) {
      continue;
    }
    // flat 形态不携带 op：从值的形状还原（区间 → between；逗号多值 → in；multi-select 单值归一为数组）
    let op = defaultOpForDef(def);
    let typed = value;
    if (Array.isArray(value)) {
      if (raw.includes("..")) op = "between";
      else if (def.kind !== "multi-select") op = "in";
    } else if (def.kind === "multi-select") {
      typed = [value];
    }
    leaves.push({ field: def.field, op, value: typed });
  }
  if (leaves.length === 0) return undefined;
  if (leaves.length === 1) return leaves[0];
  return { combinator: "and", children: leaves };
}
