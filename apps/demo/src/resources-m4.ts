import type { ListParams, Page } from "@fleetly/patterns-ui-core/data";
import { defineResource, inferColumns } from "@fleetly/patterns-ui-core/resource";
import { api } from "./lib/api";
import { createRestClient } from "./lib/clients";
import type {
  MockAuditEvent,
  MockInvitation,
  MockMember,
  MockMetricPoint,
  MockNotification,
  MockRegion,
} from "./mocks/db";

/**
 * 资源层：defineResource 定义 + team/notification/search/regions/metrics 适配。
 * auditDef 是产品 Audit 页（/audit）的定义源；列由 inferColumns 从内联样本推断。
 * 手写实现作为库回归对照保留在 /dev/audit-legacy（不进导航）。
 */

// ---------------------------------------------------------------------------
// audit 定义（产品页 /audit；手写对照见 routes/_shell/t.$tenantId.dev.audit-legacy.tsx）
// ---------------------------------------------------------------------------

const AUDIT_SAMPLE: Record<string, unknown>[] = [
  {
    id: "ac-evt-0001",
    action: "service.create",
    resource: "services/ac-svc-001",
    actor: "usr_1",
    ip: "10.1.2.3",
    createdAt: "2026-09-21T08:00:00.000Z",
  },
  {
    id: "ac-evt-0002",
    action: "member.invite",
    resource: "members/usr_2",
    actor: "usr_2",
    ip: "10.2.3.4",
    createdAt: "2026-09-21T07:00:00.000Z",
  },
];

const guessed = inferColumns(AUDIT_SAMPLE, { skipFields: ["ip"] });

export const auditDef = defineResource<MockAuditEvent>({
  name: "audit-events",
  singular: "audit event",
  label: "Audit",
  client: createRestClient<MockAuditEvent, Partial<MockAuditEvent>, Partial<MockAuditEvent>>(
    (tid) => `/api/t/${tid}/audit-events`,
  ),
  columns: guessed.columns as never,
  filters: [
    {
      field: "action",
      label: "动作",
      kind: "multi-select",
      options: [
        "service.create",
        "service.update",
        "service.delete",
        "service.deploy",
        "member.invite",
        "member.remove",
        "apikey.create",
        "apikey.revoke",
        "settings.update",
      ].map((value) => ({ value, label: value })),
    },
    { field: "resource", label: "资源", kind: "text" },
    { field: "createdAt", label: "时间范围", kind: "date-range" },
  ],
  list: { mode: "server-cursor", pageSize: 20, facets: ["action"] },
  nav: { group: "Data", icon: "scroll-text", order: 11 },
});

/** 资源定义注册表（navFromResources 派生导航用；新资源的 def 加到这里） */
export const resourceDefs = [auditDef];

// ---------------------------------------------------------------------------
// team（members + invitations）
// ---------------------------------------------------------------------------

function tidPath(): string {
  const match = globalThis.location?.pathname.match(/\/t\/([^/]+)/);
  return match?.[1] ?? "acme-web";
}

export const teamClient = {
  async listMembers(): Promise<MockMember[]> {
    const page = await api<Page<MockMember>>(`/api/t/${tidPath()}/members?pageSize=100`);
    return page.rows;
  },
  async updateMemberRole(id: string, role: MockMember["role"]): Promise<MockMember> {
    return api<MockMember>(`/api/t/${tidPath()}/members/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    });
  },
  async removeMember(id: string): Promise<void> {
    await api<void>(`/api/t/${tidPath()}/members/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
  async listInvitations(): Promise<MockInvitation[]> {
    const page = await api<Page<MockInvitation>>(`/api/t/${tidPath()}/invitations?pageSize=100`);
    return page.rows;
  },
  async createInvitation(input: { email: string; role: MockMember["role"] }) {
    return api<MockInvitation>(`/api/t/${tidPath()}/invitations`, {
      method: "POST",
      body: JSON.stringify(input),
    });
  },
  async revokeInvitation(id: string): Promise<void> {
    await api<void>(`/api/t/${tidPath()}/invitations/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
  /** 演示端点：接受第一个待处理邀请（team 页「模拟接受」按钮） */
  async acceptFirstPending(): Promise<unknown> {
    const page = await api<Page<MockInvitation>>(`/api/t/${tidPath()}/invitations?pageSize=100`);
    const pending = page.rows.find((r) => r.status === "pending");
    if (!pending) throw new Error("没有待处理邀请");
    return api(`/api/t/${tidPath()}/invitations/${encodeURIComponent(pending.id)}/accept`, {
      method: "POST",
    });
  },
};

// ---------------------------------------------------------------------------
// notifications（ResourceClient 形态 + markAllRead 专用端点）
// ---------------------------------------------------------------------------

export const notificationClient = {
  async list(params: ListParams): Promise<Page<MockNotification>> {
    const sp = new URLSearchParams({ pageSize: String(params.pageSize) });
    if (params.cursor) sp.set("cursor", params.cursor);
    return api<Page<MockNotification>>(`/api/t/${tidPath()}/notifications?${sp.toString()}`);
  },
  async update(id: string, vars: Partial<MockNotification>): Promise<MockNotification> {
    return api<MockNotification>(`/api/t/${tidPath()}/notifications/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(vars),
    });
  },
  async markAllRead(ids: string[]): Promise<unknown> {
    return api(`/api/t/${tidPath()}/notifications/read-all`, {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
  },
};

// ---------------------------------------------------------------------------
// regions（树形）与 metrics-points（1000 行虚拟化）
// ---------------------------------------------------------------------------

export const regionsClient = createRestClient<MockRegion, Partial<MockRegion>, Partial<MockRegion>>(
  (tid) => `/api/t/${tid}/regions`,
);

export const metricsClient = createRestClient<
  MockMetricPoint,
  Partial<MockMetricPoint>,
  Partial<MockMetricPoint>
>((tid) => `/api/t/${tid}/metrics-points`);

// ---------------------------------------------------------------------------
// 全局搜索（聚合端点 → GlobalSearchResourceDef）
// ---------------------------------------------------------------------------

export interface SearchHit {
  id: string;
  title: string;
  subtitle?: string;
  type: string;
  ref: string;
}

export async function searchAll(q: string, tid: string): Promise<SearchHit[]> {
  const result = await api<{
    services: SearchHit[];
    members: SearchHit[];
    auditEvents: SearchHit[];
  }>(`/api/search?q=${encodeURIComponent(q)}&tid=${encodeURIComponent(tid)}`);
  return [...result.services, ...result.members, ...result.auditEvents];
}

export const searchClient = { searchAll };
