import { requireAuth } from "@fleetly/patterns-ui-core/auth";
import { createFileRoute, Outlet } from "@tanstack/react-router";

/**
 * 壳布局（pathless）：requireAuth 守卫；未登录 → /auth/sign-in?next=<当前路径>。
 * 具体壳（AppShell）在 t.$tenantId 布局内渲染（导航是租户维度的）。
 */
export const Route = createFileRoute("/_shell")({
  beforeLoad: requireAuth(),
  component: () => <Outlet />,
});
