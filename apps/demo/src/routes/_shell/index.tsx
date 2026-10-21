import { rootTenantRedirect } from "@fleetly/ui-component-core/tenant";
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
