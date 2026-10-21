/**
 * core/auth —— 认证与权限（docs/core-api.md §8）。
 *
 * AuthProvider 接受宿主实现的 provider 协议（login/logout/check）；check() 挂载后执行一次。
 * 路由守卫（requireAuth/requireRole）经模块级快照读取认证态（beforeLoad 在 React 外运行），
 * 首次 check 完成前挂起等待；权限判定 useCan 一律 fail-closed。
 */
import { useQueryClient } from "@tanstack/react-query";
import { type AnyRedirect, redirect } from "@tanstack/react-router";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useMounted } from "../mounted";

export { useMounted };

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role?: string;
  permissions?: string[];
}

export interface AuthProviderProps {
  provider: {
    login(credentials: unknown): Promise<AuthUser>;
    logout(): Promise<void>;
    check(): Promise<{ authenticated: boolean; user?: AuthUser }>;
  };
  /** 401 全局回调（清态 + 跳登录）；宿主经 notifyUnauthorized() 从 fetch 层触发 */
  onUnauthorized?: () => void;
  children: ReactNode;
}

/** beforeLoad 上下文的最小结构约定（TanStack Router 的 ctx 满足此形状） */
export interface BeforeLoadCtx {
  location: { href: string; pathname: string };
}

// ---------------------------------------------------------------------------
// 模块级认证快照：路由守卫在 React 渲染外运行，从这里读态；Provider 负责驱动更新。
// ---------------------------------------------------------------------------

export type AuthStatus = "loading" | "authenticated" | "unauthenticated";

export interface AuthSnapshot {
  status: AuthStatus;
  user?: AuthUser;
}

let snapshot: AuthSnapshot = { status: "loading" };
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function setSnapshot(next: AuthSnapshot): void {
  snapshot = next;
  emit();
}

/** 当前认证快照（同步读取；测试与调试用） */
export function getAuthSnapshot(): Readonly<AuthSnapshot> {
  return snapshot;
}

/** 等待首次 check() 完成（已 settled 时立即返回） */
export function waitForAuth(): Promise<AuthSnapshot> {
  if (snapshot.status !== "loading") {
    return Promise.resolve(snapshot);
  }
  return new Promise((resolve) => {
    const listener = () => {
      listeners.delete(listener);
      resolve(snapshot);
    };
    listeners.add(listener);
  });
}

let unauthorizedHandler: (() => void) | undefined;

/**
 * 401 全局通知：宿主 API 层捕获 401 后调用 → 快照置为未认证并触发 onUnauthorized 回调
 * （回调内做清态 + 跳登录）。Provider 挂载期间快照变化会同步反映到 useAuth()。
 */
export function notifyUnauthorized(): void {
  unauthorizedHandler?.();
  if (snapshot.status !== "unauthenticated") {
    setSnapshot({ status: "unauthenticated" });
  }
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface AuthContextValue {
  user: AuthUser | undefined;
  isAuthenticated: boolean;
  isLoading: boolean;
  login(credentials: unknown): Promise<AuthUser>;
  logout(): Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ provider, onUnauthorized, children }: AuthProviderProps) {
  const [state, setState] = useState<AuthSnapshot>(snapshot);
  const queryClient = useQueryClient();

  // 快照订阅：notifyUnauthorized 等模块级更新同步进 React 状态
  useEffect(() => {
    const listener = () => setState({ ...snapshot });
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  // onUnauthorized 回调注册（模块级，供 fetch 层经 notifyUnauthorized 触发）
  useEffect(() => {
    unauthorizedHandler = onUnauthorized;
    return () => {
      unauthorizedHandler = undefined;
    };
  }, [onUnauthorized]);

  // check() 一次
  useEffect(() => {
    let alive = true;
    provider
      .check()
      .then((result) => {
        if (!alive) return;
        if (result.authenticated && result.user) {
          setSnapshot({ status: "authenticated", user: result.user });
        } else {
          setSnapshot({ status: "unauthenticated" });
        }
      })
      .catch(() => {
        if (alive) {
          setSnapshot({ status: "unauthenticated" });
        }
      });
    return () => {
      alive = false;
    };
  }, [provider]);

  const login = useCallback(
    async (credentials: unknown) => {
      const user = await provider.login(credentials);
      queryClient.clear();
      setSnapshot({ status: "authenticated", user });
      return user;
    },
    [provider, queryClient],
  );

  const logout = useCallback(async () => {
    try {
      await provider.logout();
    } finally {
      queryClient.clear();
      setSnapshot({ status: "unauthenticated" });
    }
  }, [provider, queryClient]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user: state.user,
      isAuthenticated: state.status === "authenticated",
      isLoading: state.status === "loading",
      login,
      logout,
    }),
    [state, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error(
      "useAuth must be used within an AuthProvider (@fleetly/ui-component-core/auth)",
    );
  }
  return ctx;
}

// ---------------------------------------------------------------------------
// 路由守卫（beforeLoad 用；返回 redirect 结果由 TanStack Router materializeRedirect 处理）
// ---------------------------------------------------------------------------

function signInRedirect(ctx: BeforeLoadCtx): AnyRedirect {
  return redirect({ to: "/auth/sign-in", search: { next: ctx.location.href } }) as AnyRedirect;
}

/** 未认证 → redirect 到 /auth/sign-in 并携带 next（当前路径+查询）回跳参数 */
export function requireAuth(): (ctx: BeforeLoadCtx) => Promise<AnyRedirect | undefined> {
  return async (ctx) => {
    const current = await waitForAuth();
    if (current.status !== "authenticated") {
      return signInRedirect(ctx);
    }
  };
}

/** 角色守卫：未认证同 requireAuth；认证但角色不匹配 → redirect 到 /403 */
export function requireRole(
  allow: string[] | ((user: AuthUser) => boolean),
): (ctx: BeforeLoadCtx) => Promise<AnyRedirect | undefined> {
  return async (ctx) => {
    const current = await waitForAuth();
    if (current.status !== "authenticated" || !current.user) {
      return signInRedirect(ctx);
    }
    const allowed =
      typeof allow === "function" ? allow(current.user) : allow.includes(current.user.role ?? "");
    if (!allowed) {
      return redirect({ to: "/403" }) as AnyRedirect;
    }
  };
}

// ---------------------------------------------------------------------------
// 权限（fail-closed）
// ---------------------------------------------------------------------------

/**
 * 权限匹配（纯函数）：
 * permissions 缺失/为空 → 一律 false；含 '*' → 全放行；
 * 带 resource 时匹配 `resource.action` 或 `resource:*`；不带 resource 时匹配裸 action。
 */
export function matchPermission(
  permissions: string[] | undefined,
  action: string,
  resource?: string,
): boolean {
  if (!permissions || permissions.length === 0) {
    return false;
  }
  if (permissions.includes("*")) {
    return true;
  }
  if (resource !== undefined) {
    return (
      permissions.includes(`${resource}:${"*"}`) || permissions.includes(`${resource}.${action}`)
    );
  }
  return permissions.includes(action);
}

/** useCan 的纯函数内核（便于测试）：返回可判定 nav 项可见性的谓词 */
export function useCan(): (action: string, resource?: string) => boolean {
  const { user } = useAuth();
  const permissions = user?.permissions;
  return useCallback(
    (action: string, resource?: string) => matchPermission(permissions, action, resource),
    [permissions],
  );
}

export type CanFn = (action: string, resource?: string) => boolean;

/**
 * canAccess 约定：接收当前用户的权限谓词（useCan() 的返回值）返回可见性。
 * 例：`canAccess: (can) => can("write", "services")`（core-api §8 字面签名 `(action, resource?) => boolean`
 * 的可运行读法：第一参数即 can 谓词）。
 */
interface CanAccessible {
  canAccess?: (can: CanFn) => boolean;
}

/** filterNavByCan 的纯函数内核（便于测试） */
export function filterByCanFn<T extends CanAccessible>(
  items: T[],
  can: (action: string, resource?: string) => boolean,
): T[] {
  return items.filter((item) => !item.canAccess || item.canAccess(can));
}

/**
 * 按权限过滤导航项（canAccess 缺省 = 对所有人可见；权限判定 fail-closed）。
 * 本函数按 hook 语义使用（内部调用 useCan/useMemo）；命名遵循 core-api §8 规格，
 * 调用方须遵守 Rules of Hooks（仅在组件/其它 hook 顶层调用）。
 */
export function filterNavByCan<T extends CanAccessible>(items: T[]): T[] {
  // biome-ignore lint/correctness/useHookAtTopLevel: 规格名不以 use 开头，但语义是 hook（见上）
  const can = useCan();
  // biome-ignore lint/correctness/useHookAtTopLevel: 规格名不以 use 开头，但语义是 hook（见上）
  return useMemo(() => filterByCanFn(items, can), [items, can]);
}
