import type { IncomingHttpHeaders } from "node:http";
import { fail, type MockResult } from "./types";

// ---------------------------------------------------------------------------
// chaos 派发器（M7-B2，docs/paradigm.md §6-B2）：demo-error 单源语义。
//
// 用法：页面 URL 携带 ?demo-error=<code>（src/lib/api.ts 逐请求读取并转发为
// x-demo-error 请求头）；或直接对 /api/* 请求设置该头（curl/调试等价入口）。
//
// code 形态（二选一，非法 code 静默忽略、请求正常放行）：
//   - "<status>"            全局：所有资源端点返回该状态码（如 ?demo-error=500）
//   - "<resource>:<status>" 定向：仅命中资源返回该状态码（如 ?demo-error=services:403）
//   status 须为 400–599 的整数；资源名见下方 resourceOf 的身份规则。
//
// 资源身份（resourceOf）：/api/ 之后的首段，跳过租户段对 t/:tenantId；嵌套子资源
// 归属父资源。全清单（9 个路由组统一生效——派发点在 plugin.ts mock 入口，命中
// 路由后、handler 前）：
//   auth（/api/auth/*）、me（/api/me、/api/me/password）、orgs、users、search、
//   services（含 /services/:id 与其下 deployments 子资源）、deployments、api-keys、
//   audit-events、members、invitations、notifications、regions、metrics-points、tasks。
//
// 全局模式豁免会话端点（auth、me）：全局 401 会触发前端全局登出跳转、全局 5xx
// 会让 AuthProvider.check 判定未认证——一次全局 chaos 即把演示会话打死。定向
// （auth:500 / me:500）不受豁免，可显式演示会话故障。
//
// 迁移记录（M7-B2）：services.ts / audit.ts 各自的 x-demo-error header gate
// （仅覆盖 2/9 路由组、限 401|403|500）已由本派发器取代并删除；services 的
// 搜索词 boom → 500 演示保留（handler 内置业务规则，与 chaos 正交）。
//
// 422 字段回填演示不受 chaos 影响：chaos 返回通用 { message } 信封，字段级
// 错误仍由 handler 内置校验规则产生（name<3 / taken / demo1234 等）。
// ---------------------------------------------------------------------------

export interface ChaosDirective {
  /** 原始 code（如 "services:403" / "500"），进错误消息便于定位 */
  code: string;
  /** 定向资源名；undefined = 全局 */
  resource: string | undefined;
  /** HTTP 状态码（400–599） */
  status: number;
}

/** 解析 x-demo-error 头；非法（缺失/格式错/状态码越界）返回 undefined */
export function parseChaosCode(raw: string | string[] | undefined): ChaosDirective | undefined {
  const code = Array.isArray(raw) ? raw[0] : raw;
  if (code === undefined || code === "") {
    return undefined;
  }
  const colon = code.indexOf(":");
  const resource = colon > 0 ? code.slice(0, colon) : undefined;
  const statusPart = colon > 0 ? code.slice(colon + 1) : code;
  if (resource !== undefined && !/^[a-z][a-z0-9-]*$/.test(resource)) {
    return undefined;
  }
  const status = Number(statusPart);
  if (!Number.isInteger(status) || status < 400 || status > 599) {
    return undefined;
  }
  return { code, resource, status };
}

/** API 路径 → 资源身份：/api/ 后首段，跳过 t/:tenantId 段；嵌套子资源归父 */
export function resourceOf(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean);
  const rest = segments[0] === "api" ? segments.slice(1) : segments;
  const body = rest[0] === "t" && rest.length >= 2 ? rest.slice(2) : rest;
  return body[0] ?? "";
}

/** 全局 chaos 豁免的会话端点资源（定向不豁免；理由见文件头） */
const SESSION_RESOURCES = new Set(["auth", "me"]);

/**
 * chaos 门卫：命中则返回错误 MockResult（由 plugin.ts 在 handler 前发送），
 * 未命中返回 undefined（正常放行给 handler）。
 */
export function chaosGate(headers: IncomingHttpHeaders, pathname: string): MockResult | undefined {
  const directive = parseChaosCode(headers["x-demo-error"]);
  if (directive === undefined) {
    return undefined;
  }
  const resource = resourceOf(pathname);
  if (directive.resource === undefined) {
    if (SESSION_RESOURCES.has(resource)) {
      return undefined;
    }
  } else if (directive.resource !== resource) {
    return undefined;
  }
  const scope = directive.resource ?? "全局";
  return fail(directive.status, `模拟错误（demo-error=${directive.code}，${scope}）`);
}
