import { createResource } from "@fleetly/ui-component-core/data";
import { createRestClient } from "./lib/clients";
import { type MockAuditEvent, type MockService, usersForRef } from "./mocks/db";

/**
 * demo 的资源注册（createResource）：queryKey/失效/租户隔离由 core 统一。
 * services 带 CRUD/批量（409 演示经 If-Match）；audit-events 只读 keyset。
 */
export const servicesResource = createResource<
  MockService,
  Partial<MockService>,
  Partial<MockService>
>({
  name: "services",
  client: createRestClient<MockService, Partial<MockService>, Partial<MockService>>(
    (tid) => `/api/t/${tid}/services`,
    { withVersionConflict: true },
  ),
  tenantScoped: true,
});

export const auditResource = createResource<
  MockAuditEvent,
  Partial<MockAuditEvent>,
  Partial<MockAuditEvent>
>({
  name: "audit-events",
  client: createRestClient<MockAuditEvent, Partial<MockAuditEvent>, Partial<MockAuditEvent>>(
    (tid) => `/api/t/${tid}/audit-events`,
  ),
  tenantScoped: true,
});

/** owner userId → 用户引用（cell-user resolve 用；demo 直接读 mock 种子） */
export function resolveUser(id: string): { name: string; avatarUrl?: string } | undefined {
  const user = usersForRef().find((u) => u.id === id);
  return user ? { name: user.name, avatarUrl: user.avatarUrl } : undefined;
}
