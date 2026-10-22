import { HttpError } from "@patterns-ui/core/data";

export const TOKEN_KEY = "demo:token";

export function getToken(): string | null {
  try {
    return globalThis.localStorage?.getItem(TOKEN_KEY) ?? null;
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token === null) {
      globalThis.localStorage?.removeItem(TOKEN_KEY);
    } else {
      globalThis.localStorage?.setItem(TOKEN_KEY, token);
    }
  } catch {
    /* 非浏览器环境：忽略 */
  }
}

/**
 * demo 的 fetch 封装：自动带 Bearer token；非 2xx 抛 HttpError（message 优先取响应体 message）。
 *
 * 2xx JSON 兜底（M6-E）：204 或空 body → 约定值 undefined（调用方按可选数据处理）；
 * 非空但非 JSON → 抛 HttpError（清晰错误，不泄漏 SyntaxError）。
 */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken();
  const response = await fetch(path, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  if (!response.ok) {
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }
    const message =
      (body as { message?: string } | undefined)?.message ?? `请求失败（HTTP ${response.status}）`;
    throw new HttpError(response.status, message, body);
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const text = await response.text();
  if (text.trim() === "") {
    return undefined as T;
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(response.status, `响应不是有效 JSON（HTTP ${response.status}）`, text);
  }
}
