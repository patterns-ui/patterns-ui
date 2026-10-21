import type { AuthProviderProps, AuthUser } from "@fleetly/ui-component-core/auth";
import { HttpError } from "@fleetly/ui-component-core/data";
import { api, getToken, setToken } from "./api";

interface LoginResponse {
  token: string;
  user: AuthUser;
}

/**
 * demo 的 AuthProvider 实现（core/auth 协议）：
 * login → POST /api/auth/login（token 存 localStorage 'demo:token'）；
 * logout → POST /api/auth/logout（失败也清本地 token）；
 * check → GET /api/me（Bearer 校验；401 时清 token 返回未认证）。
 */
export const authProvider: AuthProviderProps["provider"] = {
  async login(credentials) {
    const { email, password } = credentials as { email: string; password: string };
    try {
      const res = await api<LoginResponse>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(res.token);
      return res.user;
    } catch (error) {
      if (error instanceof HttpError && error.status === 401) {
        throw new HttpError(401, "邮箱或密码错误（demo：demo@fleetly.dev / 任意密码）");
      }
      throw error;
    }
  },

  async logout() {
    try {
      await api("/api/auth/logout", { method: "POST" });
    } catch {
      /* mock 不可用也要保证本地登出 */
    } finally {
      setToken(null);
    }
  },

  async check() {
    if (!getToken()) {
      return { authenticated: false };
    }
    try {
      const res = await api<{ user: AuthUser }>("/api/me");
      return { authenticated: true, user: res.user };
    } catch {
      setToken(null);
      return { authenticated: false };
    }
  },
};
