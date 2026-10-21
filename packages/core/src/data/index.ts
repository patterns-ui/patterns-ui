/**
 * core/data —— 数据契约（docs/core-api.md §1）。
 *
 * M1 先落地 HttpError（error-state 等 block 的分档依赖）；
 * Page/ListParams/ResourceClient/createResource 等完整契约在 M2 实现。
 */

/** 细分：401 未认证 / 403 无权限 / 404 不存在 / 409 冲突 / >=5xx 服务端 / 其它 */
export type HttpErrorKind =
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "conflict"
  | "server"
  | "other";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }

  get kind(): HttpErrorKind {
    if (this.status === 401) return "unauthorized";
    if (this.status === 403) return "forbidden";
    if (this.status === 404) return "not-found";
    if (this.status === 409) return "conflict";
    if (this.status >= 500) return "server";
    return "other";
  }
}
