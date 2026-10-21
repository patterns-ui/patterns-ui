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
