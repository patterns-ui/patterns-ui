import { HttpError } from "@fleetly/ui-component-core/data";

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
  return (await response.json()) as T;
}
