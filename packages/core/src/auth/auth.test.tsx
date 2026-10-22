// @vitest-environment happy-dom
/**
 * AuthProvider 组件级测试（docs/paradigm.md §5-B 任务7）：
 * check() 会话快照流转、401 快照流转（notifyUnauthorized → unauthenticated）、
 * onUnauthorized 全局回调、login/logout 快照与缓存清理。
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, type AuthUser, getAuthSnapshot, notifyUnauthorized, useAuth } from "./index";

const USER: AuthUser = { id: "u1", name: "Ada", email: "ada@example.com", role: "admin" };

function makeClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

interface AuthProbeResult {
  user: AuthUser | undefined;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: unknown) => Promise<AuthUser>;
  logout: () => Promise<void>;
}

function renderAuth(
  provider: Parameters<typeof AuthProvider>[0]["provider"],
  onUnauthorized?: () => void,
) {
  const queryClient = makeClient();
  let probe: AuthProbeResult | undefined;
  // biome-ignore lint/correctness/noComponentHookFactories: 测试探针组件（闭包捕获 hook 结果）
  function Probe() {
    const auth = useAuth();
    probe = {
      user: auth.user,
      isAuthenticated: auth.isAuthenticated,
      isLoading: auth.isLoading,
      login: auth.login,
      logout: auth.logout,
    };
    return null;
  }
  const view = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider provider={provider} onUnauthorized={onUnauthorized}>
        <Probe />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { view, queryClient, probe: () => probe as AuthProbeResult };
}

afterEach(() => {
  // 模块级快照复位，避免用例间串扰
  notifyUnauthorized(); // 已是 unauthenticated 时幂等
});

describe("AuthProvider", () => {
  it("check() 成功 → 快照 authenticated，useAuth 反映用户", async () => {
    const { probe } = renderAuth({
      login: vi.fn(async () => USER),
      logout: vi.fn(async () => {}),
      check: vi.fn(async () => ({ authenticated: true, user: USER })),
    });
    expect(probe().isLoading).toBe(true);
    await waitFor(() => expect(probe().isAuthenticated).toBe(true));
    expect(probe().user?.id).toBe("u1");
    expect(getAuthSnapshot().status).toBe("authenticated");
  });

  it("check() 未认证 → 快照 unauthenticated", async () => {
    const { probe } = renderAuth({
      login: vi.fn(async () => USER),
      logout: vi.fn(async () => {}),
      check: vi.fn(async () => ({ authenticated: false })),
    });
    await waitFor(() => expect(probe().isAuthenticated).toBe(false));
    expect(getAuthSnapshot().status).toBe("unauthenticated");
  });

  it("401 流转：notifyUnauthorized → 快照 unauthenticated + onUnauthorized 回调触发", async () => {
    const onUnauthorized = vi.fn();
    const { probe } = renderAuth(
      {
        login: vi.fn(async () => USER),
        logout: vi.fn(async () => {}),
        check: vi.fn(async () => ({ authenticated: true, user: USER })),
      },
      onUnauthorized,
    );
    await waitFor(() => expect(probe().isAuthenticated).toBe(true));
    expect(onUnauthorized).not.toHaveBeenCalled();

    // 宿主 fetch 层捕获 401 → notifyUnauthorized()
    act(() => {
      notifyUnauthorized();
    });
    await waitFor(() => expect(probe().isAuthenticated).toBe(false));
    expect(getAuthSnapshot().status).toBe("unauthenticated");
    expect(onUnauthorized).toHaveBeenCalledTimes(1);
  });

  it("login/logout 驱动快照流转并清 query 缓存", async () => {
    const { queryClient, probe } = renderAuth({
      login: vi.fn(async () => USER),
      logout: vi.fn(async () => {}),
      check: vi.fn(async () => ({ authenticated: false })),
    });
    const clearSpy = vi.spyOn(queryClient, "clear");
    queryClient.setQueryData(["probe"], "cached");
    await waitFor(() => expect(probe().isAuthenticated).toBe(false));
    expect(clearSpy).not.toHaveBeenCalled();

    await act(async () => {
      await probe().login({ email: "a@b.c", password: "x" });
    });
    expect(probe().isAuthenticated).toBe(true);
    expect(probe().user?.id).toBe("u1");
    expect(getAuthSnapshot().status).toBe("authenticated");
    expect(clearSpy).toHaveBeenCalledTimes(1); // login 清缓存（切换身份残留查询不泄漏）
    expect(queryClient.getQueryData(["probe"])).toBeUndefined();

    await act(async () => {
      await probe().logout();
    });
    expect(probe().isAuthenticated).toBe(false);
    expect(getAuthSnapshot().status).toBe("unauthenticated");
    expect(clearSpy).toHaveBeenCalledTimes(2);
  });
});

describe("401 快照流转与守卫联动（requireAuth 消费同一快照源）", () => {
  it("notifyUnauthorized 后 waitForAuth 立即返回 unauthenticated", async () => {
    renderAuth({
      login: vi.fn(async () => USER),
      logout: vi.fn(async () => {}),
      check: vi.fn(async () => ({ authenticated: true, user: USER })),
    });
    await waitFor(() => expect(getAuthSnapshot().status).toBe("authenticated"));
    act(() => {
      notifyUnauthorized();
    });
    // 快照同步翻转（守卫 beforeLoad 从同一模块级快照读取）
    expect(getAuthSnapshot().status).toBe("unauthenticated");
  });
});
