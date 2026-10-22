// @vitest-environment happy-dom
/**
 * TenantProvider 组件级测试（docs/paradigm.md §5-B 任务7）：
 * 租户切换清 query 缓存（removeQueries 精准清旧租户段）、last-tenant 记忆与恢复
 * （含信封前裸字符串旧数据迁移）。
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { act, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Page } from "../data";
import { getRememberedTenant, rememberTenant, TENANT_STORAGE_KEY, TenantProvider } from "./index";

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

function stubLocalStorage(): void {
  const map = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  });
}

const TENANTS = [
  { id: "acme-web", name: "Acme Web" },
  { id: "torchwood", name: "Torchwood" },
];

/** 建真路由（/t/$tenantId 布局挂 TenantProvider），返回 router 与 queryClient */
function makeTenantRouter(initial: string) {
  // biome-ignore lint/correctness/noComponentHookFactories: 布局组件内联（TenantProvider 需路由 params）
  function TenantLayout() {
    return (
      <TenantProvider
        resolveTenant={async (id) => TENANTS.find((t) => t.id === id) ?? null}
        listTenants={async () => TENANTS}
      >
        <Outlet />
      </TenantProvider>
    );
  }
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const shellRoute = createRoute({
    getParentRoute: () => rootRoute,
    id: "_shell",
    component: TenantLayout,
  });
  const tenantRoute = createRoute({
    getParentRoute: () => shellRoute,
    path: "t/$tenantId",
    component: () => null,
  });
  return createRouter({
    routeTree: rootRoute.addChildren([shellRoute.addChildren([tenantRoute])]),
    history: createMemoryHistory({ initialEntries: [initial] }),
  });
}

async function renderTenantRouter(initial: string, queryClient: QueryClient) {
  const router = makeTenantRouter(initial);
  await act(async () => {
    await router.load();
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

describe("TenantProvider", () => {
  it("last-tenant 记忆：挂载后 rememberTenant 写入（createStorage 信封）", async () => {
    stubLocalStorage();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    await renderTenantRouter("/t/acme-web", queryClient);

    await waitFor(() => expect(getRememberedTenant()).toBe("acme-web"));
    // 信封格式持久化（{v,d}），读取方无感
    const raw = localStorage.getItem(TENANT_STORAGE_KEY) ?? "";
    expect(JSON.parse(raw)).toEqual({ v: 1, d: "acme-web" });
  });

  it("旧格式迁移：裸字符串 last-tenant 无感沿用，再记忆落新信封", () => {
    stubLocalStorage();
    localStorage.setItem(TENANT_STORAGE_KEY, "torchwood"); // 信封前裸串
    expect(getRememberedTenant()).toBe("torchwood");
    rememberTenant("acme-web");
    expect(getRememberedTenant()).toBe("acme-web");
  });

  it("切换租户 → 精准 removeQueries 清旧租户缓存（新租户/无关查询保留）", async () => {
    stubLocalStorage();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const page: Page<unknown> = { rows: [], total: 0 };
    queryClient.setQueryData(["widgets", "acme-web", "list", {}], page);
    queryClient.setQueryData(["widgets", "torchwood", "list", {}], page);
    queryClient.setQueryData(["fc", "tenants"], TENANTS);

    const router = await renderTenantRouter("/t/acme-web", queryClient);
    await waitFor(() => expect(getRememberedTenant()).toBe("acme-web"));

    await act(async () => {
      await router.navigate({ to: "/t/torchwood", replace: true });
    });
    await waitFor(() => expect(getRememberedTenant()).toBe("torchwood"));
    // 旧租户段缓存被精准清除；新租户/无关查询保留
    expect(queryClient.getQueryData(["widgets", "acme-web", "list", {}])).toBeUndefined();
    expect(queryClient.getQueryData(["widgets", "torchwood", "list", {}])).toBeDefined();
    expect(queryClient.getQueryData(["fc", "tenants"])).toBeDefined();
  });
});
