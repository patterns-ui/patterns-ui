import { createResource } from "@patterns-ui/core/data";
import { createCursorClient, createRestClient } from "./lib/clients";
import {
  type MockApiKey,
  type MockAuditEvent,
  type MockCertificate,
  type MockDeployment,
  type MockService,
  usersForRef,
} from "./mocks/db";

/**
 * demo 的资源注册（createResource）：queryKey/失效/租户隔离由 core 统一。
 * services 带 CRUD/批量（409 演示经 If-Match，M3 起强制乐观并发）；audit-events 只读 keyset；
 * M3 增：users（reference-select 数据源）、deployments（service 子资源，页面按 serviceId 构建）、api-keys。
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

export interface MockUserRef {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
}

/** 非租户作用域（/api/users）：reference-select 搜索/分页/就地新建的数据源 */
export const usersResource = createResource<
  MockUserRef,
  Partial<MockUserRef>,
  Partial<MockUserRef>
>({
  name: "users",
  client: createRestClient<MockUserRef, Partial<MockUserRef>, Partial<MockUserRef>>(
    () => "/api/users",
  ),
  tenantScoped: false,
});

export const apiKeysResource = createResource<
  MockApiKey,
  { name: string; expiresIn?: string },
  Partial<MockApiKey>
>({
  name: "api-keys",
  client: createRestClient<MockApiKey, { name: string; expiresIn?: string }, Partial<MockApiKey>>(
    (tid) => `/api/t/${tid}/api-keys`,
  ),
  tenantScoped: true,
});

/** certificates 只读资源（TLS 证书列表：平台代管，无 create/update 消费方） */
export const certificatesResource = createResource<
  MockCertificate,
  Record<string, never>,
  Record<string, never>
>({
  name: "certificates",
  client: createRestClient<MockCertificate, Record<string, never>, Record<string, never>>(
    (tid) => `/api/t/${tid}/certificates`,
  ),
  tenantScoped: true,
});

/** deployments 是 service 子资源：页面按 serviceId 现建 client + resource（queryKey 含 sid 路径） */
export function makeDeploymentsResource(tenantId: string, serviceId: string) {
  return createResource<MockDeployment, Record<string, unknown>, Partial<MockDeployment>>({
    name: `deployments/${serviceId}`,
    client: createCursorClient<MockDeployment, Record<string, unknown>, Partial<MockDeployment>>(
      () => `/api/t/${tenantId}/services/${serviceId}/deployments`,
    ),
    tenantScoped: false,
  });
}

/** owner userId → 用户引用（cell-user resolve 用；demo 直接读 mock 种子） */
export function resolveUser(id: string): { name: string; avatarUrl?: string } | undefined {
  const user = usersForRef().find((u) => u.id === id);
  return user ? { name: user.name, avatarUrl: user.avatarUrl } : undefined;
}
