import type { IncomingMessage, ServerResponse } from "node:http";

/** mock 处理结果；undefined = 未匹配（交给下一个 handler / 404） */
export interface MockResult {
  status: number;
  body?: unknown;
}

export interface MockRequestContext {
  method: string;
  url: URL;
  query: URLSearchParams;
  params: Record<string, string>;
  /** 请求体（JSON 已解析；无 body 时为 undefined） */
  body: unknown;
  req: IncomingMessage;
  res: ServerResponse;
}

export type MockHandler = (ctx: MockRequestContext) => MockResult | Promise<MockResult> | undefined;

/** 路由条目：method + path 模式（:param 占位） */
export interface MockRoute {
  method: string;
  path: string;
  handler: MockHandler;
}

export function ok<T>(body: T, status = 200): MockResult {
  return { status, body };
}

export function fail(status: number, message: string): MockResult {
  return { status, body: { message } };
}

// ---------------------------------------------------------------------------
// 过滤树最小模型（mock 自带；M6-E）
//
// vite.config.ts 的加载链（config → plugin → handlers）跑在 Node ESM 下，不走
// vite 的 resolver alias——mock 层不得 import `@patterns-ui/core`（否则 dev 依赖
// 先构建 core dist，干净 clone 的 install+dev 即起被破坏）。形状与 core/filters
// 的 FilterTree 子集对齐（field/op/value 叶子 + combinator/children 节点）。
// ---------------------------------------------------------------------------

export interface MockFilterLeaf {
  field: string;
  op:
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
    | "exists"
    | (string & {});
  value: unknown;
}

export interface MockFilterNode {
  combinator: "and" | "or";
  children: MockFilterTree[];
}

export type MockFilterTree = MockFilterLeaf | MockFilterNode;

export function isMockFilterNode(tree: MockFilterTree): tree is MockFilterNode {
  return "combinator" in tree && Array.isArray(tree.children);
}

export function isMockFilterLeaf(tree: MockFilterTree): tree is MockFilterLeaf {
  return "field" in tree && "op" in tree;
}
