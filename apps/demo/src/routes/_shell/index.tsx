/**
 * 【M7-A3 豁免清单】重定向桩：`/` 的记忆租户重定向（rootTenantRedirect），无组件无原型。
 */
import { rootTenantRedirect } from "@patterns-ui/core/tenant";
import { createFileRoute, redirect } from "@tanstack/react-router";
import { listTenants } from "@/lib/tenants";

/**
 * `/`（认证后落点）：重定向到记忆租户（rootTenantRedirect 含陈旧回落）。
 */
export const Route = createFileRoute("/_shell/")({
  beforeLoad: async () => {
    const tenants = await listTenants();
    throw redirect({ to: rootTenantRedirect({ tenants }) as never });
  },
});
