/**
 * core/router —— 面包屑与路由胶水（docs/core-api.md §12）。
 *
 * 路由约定：`staticData: { title: string }`（文件路由里声明）；
 * `staticData: { breadcrumbIgnore: true }` 跳过该段（壳布局等）。
 * 租户段按 `/t/$tenantId` 形态经 resolve.tenant 反查名称。
 */
import { useMatches } from "@tanstack/react-router";
import { useMemo } from "react";

export interface CrumbSegment {
  label: string;
  to?: string;
}

export interface CrumbResolve {
  /** 租户段反查名称（配合 useTenant 数据闭包传入） */
  tenant?: (id: string) => string | undefined;
  /** 无 title 段的兜底转换（如 id → 名称） */
  idFallback?: (seg: string) => string | undefined;
}

export interface CrumbMatch {
  pathname: string;
  staticData?: { title?: string; breadcrumbIgnore?: boolean };
  /** TanStack Router 的 match.params 为全路径累计参数，配合 pathname 判定归属 */
  params?: Record<string, string | undefined>;
}

const MAX_LABEL_LENGTH = 20;

function truncateSegment(label: string): string {
  return label.length > MAX_LABEL_LENGTH ? `${label.slice(0, MAX_LABEL_LENGTH)}…` : label;
}

function stripTrailingSlash(pathname: string): string {
  return pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
}

/** useCrumbs 的纯函数内核（便于测试） */
export function deriveCrumbs(matches: CrumbMatch[], resolve?: CrumbResolve): CrumbSegment[] {
  const crumbs: CrumbSegment[] = [];
  for (const match of matches) {
    if (match.staticData?.breadcrumbIgnore) {
      continue;
    }
    const pathname = stripTrailingSlash(match.pathname);
    // 有 title 的段优先按 title 输出（租户 index 路由即一个具名页面，如 Overview）
    const title = match.staticData?.title;
    if (title) {
      crumbs.push({ label: title, to: pathname });
      continue;
    }
    // 租户段：pathname 恰为 /t/<id>（子路由 match 的 params 虽也含 tenantId，但 pathname 更深）
    const tenantId = match.params?.tenantId;
    if (tenantId && /^\/t\/[^/]+$/.test(pathname)) {
      crumbs.push({
        label: truncateSegment(resolve?.tenant?.(tenantId) ?? tenantId),
        to: `/t/${tenantId}`,
      });
      continue;
    }
    // 无 title 段：取原始末段（>20 字符截断），可经 idFallback 覆盖
    const seg = pathname.split("/").filter(Boolean).pop();
    if (seg) {
      crumbs.push({ label: truncateSegment(resolve?.idFallback?.(seg) ?? seg), to: pathname });
    }
  }
  return crumbs;
}

export function useCrumbs(resolve?: CrumbResolve): CrumbSegment[] {
  const matches = useMatches();
  const crumbs = useMemo(
    () =>
      deriveCrumbs(
        matches.map((m) => ({
          pathname: m.pathname,
          staticData: m.staticData as CrumbMatch["staticData"],
          params: m.params as Record<string, string | undefined>,
        })),
        resolve,
      ),
    [matches, resolve],
  );
  return crumbs;
}
