/**
 * core/tenant —— 租户（docs/core-api.md §7）。
 *
 * 路由形态：业务路由位于 `/t/$tenantId/...` 布局下；布局组件从 URL 参数注入 TenantProvider。
 * 记忆（'fc:last-tenant'）属偏好语义存 localStorage；租户 ID 本身属查询语义存 URL。
 * queryKey 隔离由 createResource(tenantScoped) 自动完成；切换租户时本模块精准
 * removeQueries 清掉旧租户缓存。
 */
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useMounted } from "../mounted";

export { useMounted };

export interface Tenant {
  id: string;
  name: string;
  avatarUrl?: string;
  plan?: string;
}

export interface TenantProviderProps {
  resolveTenant: (id: string) => Promise<Tenant | null>;
  listTenants: () => Promise<Tenant[]>;
  children: ReactNode;
}

export const TENANT_STORAGE_KEY = "fc:last-tenant";

/**
 * 保留当前路径剩余部分，替换 `/t/:id` 前缀（setTenant 的路径计算核心，纯函数便于测试）。
 * 路径不含 `/t/<id>` 前缀时回落到租户根路径。
 */
export function replaceTenantPrefix(pathname: string, tenantId: string): string {
  if (/^\/t\/[^/]+/.test(pathname)) {
    return pathname.replace(/^\/t\/[^/]+/, `/t/${tenantId}`);
  }
  return `/t/${tenantId}`;
}

/** 记忆最近租户（偏好语义）。应在 effect / 事件内调用（localStorage 访问已 try/catch 收敛）。 */
export function rememberTenant(id: string): void {
  try {
    globalThis.localStorage?.setItem(TENANT_STORAGE_KEY, id);
  } catch {
    /* 非浏览器环境 / 隐私模式：静默降级为不记忆 */
  }
}

export function getRememberedTenant(): string | null {
  try {
    return globalThis.localStorage?.getItem(TENANT_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}
export interface RootTenantRedirectOptions {
  tenants: Tenant[];
}

/**
 * 根路径重定向目标：记忆租户有效 → `/t/<remembered>`；
 * 记忆失效（不在租户列表）→ 第一个租户；无租户 → `/t/_none`（宿主决定空态页）。
 */
export function rootTenantRedirect({ tenants }: RootTenantRedirectOptions): string {
  const remembered = getRememberedTenant();
  if (remembered && tenants.some((t) => t.id === remembered)) {
    return `/t/${remembered}`;
  }
  const first = tenants[0];
  return first ? `/t/${first.id}` : "/t/_none";
}

interface TenantContextValue {
  tenant: Tenant | undefined;
  /** 来自 URL 参数（路由层由 `$tenantId` 注入） */
  tenantId: string | undefined;
  tenants: Tenant[];
  isLoading: boolean;
  /** 保留当前路径剩余部分，替换 /t/:id 前缀后导航 */
  setTenant: (id: string) => void;
  /** removeQueries 精准清旧租户缓存（queryKey 含 previousId 的全部查询） */
  invalidateTenantCache: (previousId: string) => void;
}

const TenantContext = createContext<TenantContextValue | null>(null);

export function TenantProvider({ resolveTenant, listTenants, children }: TenantProviderProps) {
  const params = useParams({ strict: false }) as { tenantId?: string };
  const tenantId = params.tenantId;
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const tenantsQuery = useQuery({
    queryKey: ["fc", "tenants"],
    queryFn: listTenants,
    staleTime: 60_000,
  });

  const tenantQuery = useQuery({
    queryKey: ["fc", "tenant", tenantId],
    queryFn: () => resolveTenant(tenantId as string),
    enabled: tenantId != null,
    staleTime: 60_000,
  });

  const tenant = tenantQuery.data ?? undefined;

  // 记忆当前租户（偏好语义；写入收敛在 effect 内）
  useEffect(() => {
    if (tenantId) {
      rememberTenant(tenantId);
    }
  }, [tenantId]);

  // 租户 ID 变化时清旧租户缓存（createResource 的 queryKey 内嵌租户 ID，includes 精准命中）
  const prevTenantId = useRef<string | undefined>(undefined);
  useEffect(() => {
    const previousId = prevTenantId.current;
    prevTenantId.current = tenantId;
    if (previousId && previousId !== tenantId) {
      queryClient.removeQueries({ predicate: (q) => q.queryKey.includes(previousId) });
    }
  }, [tenantId, queryClient]);

  const setTenant = useCallback(
    (id: string) => {
      navigate({ to: replaceTenantPrefix(pathname, id), replace: true });
    },
    [navigate, pathname],
  );

  const invalidateTenantCache = useCallback(
    (previousId: string) => {
      queryClient.removeQueries({ predicate: (q) => q.queryKey.includes(previousId) });
    },
    [queryClient],
  );

  const value = useMemo<TenantContextValue>(
    () => ({
      tenant,
      tenantId,
      tenants: tenantsQuery.data ?? [],
      isLoading: tenantsQuery.isPending || (tenantId != null && tenantQuery.isPending),
      setTenant,
      invalidateTenantCache,
    }),
    [
      tenant,
      tenantId,
      tenantsQuery.data,
      tenantsQuery.isPending,
      tenantQuery.isPending,
      setTenant,
      invalidateTenantCache,
    ],
  );

  return <TenantContext.Provider value={value}>{children}</TenantContext.Provider>;
}

export function useTenant(): TenantContextValue {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error(
      "useTenant must be used within a TenantProvider (@patterns-ui/core/tenant)",
    );
  }
  return ctx;
}

/**
 * 可选读取（无 Provider 时返回 null）：createResource(tenantScoped) 用它取 tenantId，
 * 保证未包 TenantProvider 的宿主（无租户场景）也能使用资源层。
 */
export function useTenantOptional(): TenantContextValue | null {
  return useContext(TenantContext);
}
