/**
 * core/filters 字段级 API（M6-D 下沉）。
 *
 * filter-bar 与 facet-sidebar 两份字段级递归渲染的平行差异（读取当前字段叶子 /
 * 同字段叶子替换 / 按字段移除 / 控件类型与可选运算符推断）收敛于此；
 * 渲染 JSX 留在 block 层，本模块纯逻辑（①象限）。
 */
import {
  type FilterDef,
  type FilterLeaf,
  type FilterNode,
  type FilterOperator,
  type FilterTree,
  isFilterLeaf,
} from "./index";

// ---------------------------------------------------------------------------
// 字段级遍历（读取）
// ---------------------------------------------------------------------------

/** 字段的全部叶子（深度优先，保持出现顺序） */
export function leavesForField(tree: FilterTree | undefined, field: string): FilterLeaf[] {
  if (tree === undefined) return [];
  if (isFilterLeaf(tree)) return tree.field === field ? [tree] : [];
  return tree.children.flatMap((child) => leavesForField(child, field));
}

/** 字段的首个叶子（简单控件当前值读取） */
export function leafForField(tree: FilterTree | undefined, field: string): FilterLeaf | undefined {
  return leavesForField(tree, field)[0];
}

/** 字段 in 叶子的值集合（facet 勾选态 / multi-select 当前选中读取；无则空） */
export function inValuesForField(tree: FilterTree | undefined, field: string): string[] {
  const leaf = leafForField(tree, field);
  return leaf !== undefined && leaf.op === "in" && Array.isArray(leaf.value)
    ? (leaf.value as string[])
    : [];
}

// ---------------------------------------------------------------------------
// 字段级写入（替换 / 移除）
// ---------------------------------------------------------------------------

interface ReplaceState {
  done: boolean;
}

/** 组内替换：首个同字段叶子原位替换为新叶子，其余同字段叶子剔除；递归下钻条件组 */
function replaceInChildren(
  children: FilterTree[],
  leaf: FilterLeaf,
  state: ReplaceState,
): FilterTree[] {
  const out: FilterTree[] = [];
  for (const child of children) {
    if (isFilterLeaf(child)) {
      if (child.field === leaf.field) {
        if (!state.done) {
          out.push(leaf);
          state.done = true;
        }
        continue; // 后续同字段叶子（多叶子树）丢弃
      }
      out.push(child);
      continue;
    }
    const next = replaceInNode(child, leaf, state);
    if (next !== undefined) out.push(next);
  }
  return out;
}

function replaceInNode(
  node: FilterNode,
  leaf: FilterLeaf,
  state: ReplaceState,
): FilterTree | undefined {
  const children = replaceInChildren(node.children, leaf, state);
  if (children.length === 0) return undefined;
  if (children.length === 1) return children[0];
  return { combinator: node.combinator, children };
}

/**
 * 写入字段的叶子：同字段叶子（含嵌套在条件组内的）原位替换，保持树结构与根组合器
 * （or 树仍是 or）；字段首次出现则追加到根；异字段单叶子树 → and 组合。
 * 空值语义由调用方决定（清空请用 removeField）。
 */
export function withFieldLeaf(tree: FilterTree | undefined, leaf: FilterLeaf): FilterTree {
  if (tree === undefined) return leaf;
  if (isFilterLeaf(tree)) {
    return tree.field === leaf.field ? leaf : { combinator: "and", children: [tree, leaf] };
  }
  const state: ReplaceState = { done: false };
  const children = replaceInChildren(tree.children, leaf, state);
  const finalChildren = state.done ? children : [...children, leaf];
  if (finalChildren.length === 1) {
    // noUncheckedIndexedAccess：索引访问带 undefined，解构后显式收窄（length===1 时必命中）
    const [first] = finalChildren;
    if (first !== undefined) return first;
  }
  return { combinator: tree.combinator, children: finalChildren };
}

/** 移除字段的全部叶子（递归；塌缩空节点与单孩子节点） */
export function removeField(tree: FilterTree | undefined, field: string): FilterTree | undefined {
  if (tree === undefined) return undefined;
  if (isFilterLeaf(tree)) return tree.field === field ? undefined : tree;
  const children = tree.children
    .map((c) => removeField(c, field))
    .filter((c): c is FilterTree => c !== undefined);
  if (children.length === 0) return undefined;
  if (children.length === 1) return children[0];
  return { combinator: tree.combinator, children };
}

// ---------------------------------------------------------------------------
// 字段 → 控件类型 / 运算符推断（编辑器与控件渲染共用）
// ---------------------------------------------------------------------------

/** def.kind + 运算符 → 值控件形态（block 层据此选择渲染 JSX） */
export type FilterValueControl = "text" | "number" | "option" | "options" | "range";

export function valueControlForDef(
  def: FilterDef | undefined,
  op: FilterOperator,
): FilterValueControl {
  switch (def?.kind) {
    case "select":
      return "option";
    case "multi-select":
      return "options";
    case "date-range":
      return "range";
    case "number":
      return op === "between" ? "range" : "number";
    default:
      return "text";
  }
}

/** def.kind → 编辑器可选运算符（封闭词表：控件类型决定能表达的关系） */
export function opsForFilterDef(def: FilterDef | undefined): FilterOperator[] {
  switch (def?.kind) {
    case "number":
      return ["eq", "gt", "gte", "lt", "lte", "between"];
    case "multi-select":
      return ["in", "nin"];
    case "date-range":
      return ["between"];
    default:
      return ["eq", "ne", "contains"];
  }
}

/** 字段展示名（defs 声明优先，缺省回字段名；chips / facet 分组标题共用） */
export function filterLabel(defs: FilterDef[], field: string): string {
  return defs.find((d) => d.field === field)?.label ?? field;
}
