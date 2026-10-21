/**
 * mock 内存数据库（仅 demo dev 使用；M2 起扩充资源端点）。
 */

export interface MockUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: string;
  permissions: string[];
}

export interface MockTenant {
  id: string;
  name: string;
  plan: string;
  avatarUrl?: string;
  description: string;
}

/** 简单 SVG data-URI 头像（带底色与首字母），无需外部资源 */
function avatarDataUri(initial: string, hue: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="hsl(${hue} 55% 42%)"/><text x="16" y="21.5" font-family="system-ui,sans-serif" font-size="14" font-weight="600" fill="white" text-anchor="middle">${initial}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const DEMO_EMAIL = "demo@fleetly.dev";

export const db = {
  users: [
    {
      id: "usr_demo",
      name: "Demo User",
      email: DEMO_EMAIL,
      role: "owner",
      permissions: ["*"],
    },
  ] satisfies MockUser[],
  orgs: [
    {
      id: "acme-web",
      name: "Acme Web",
      plan: "pro",
      avatarUrl: avatarDataUri("A", 262),
      description: "主站前端与边缘服务。",
    },
    {
      id: "torchwood",
      name: "Torchwood Labs",
      plan: "team",
      avatarUrl: avatarDataUri("T", 175),
      description: "内部实验与预发环境。",
    },
    {
      id: "playground",
      name: "Playground",
      plan: "free",
      avatarUrl: avatarDataUri("P", 30),
      description: "个人沙箱，随时重建。",
    },
  ] satisfies MockTenant[],
  /** token → userId */
  tokens: new Map<string, string>(),
};

export function findUserByToken(token: string | null | undefined): MockUser | undefined {
  if (!token) {
    return undefined;
  }
  const userId = db.tokens.get(token);
  if (!userId) {
    return undefined;
  }
  return db.users.find((u) => u.id === userId);
}

// ---------------------------------------------------------------------------
// M2：services / audit-events 种子（确定性生成，保证翻页与过滤可复现）
// ---------------------------------------------------------------------------

export interface MockService {
  id: string;
  name: string;
  env: "rep" | "staging" | "prod";
  status: "running" | "degraded" | "stopped";
  replicas: number;
  region: string;
  owner: string; // userId
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface MockAuditEvent {
  id: string;
  action: string;
  actor: string; // userId
  resource: string; // "services/svc-001"
  ip: string;
  createdAt: string;
}

const SERVICE_ENVS = ["rep", "staging", "prod"] as const;
const SERVICE_STATUSES = ["running", "running", "running", "degraded", "stopped"] as const;
const REGIONS = ["cn-beijing", "cn-shanghai", "cn-hangzhou", "ap-southeast-1", "us-west-2"];
const SERVICE_WORDS = [
  "gateway",
  "payments",
  "search",
  "billing",
  "auth",
  "notify",
  "metrics",
  "ingest",
  "render",
  "worker",
  "sync",
  "proxy",
  "cache",
  "queue",
  "ledger",
  "report",
];

function seededIso(dayOffset: number, hour: number, minute: number): string {
  // 固定锚点 2026-09-01，向前推 dayOffset 天（保证 createdAt 分布稳定）
  const base = Date.UTC(2026, 8, 1, 0, 0, 0);
  return new Date(base - dayOffset * 86_400_000 + hour * 3_600_000 + minute * 60_000).toISOString();
}

function at<T>(arr: readonly T[], i: number): T {
  const value = arr[i];
  if (value === undefined) {
    throw new Error(`mock seed index out of range: ${i}`);
  }
  return value;
}

function seedServices(tenantId: string): MockService[] {
  return Array.from({ length: 120 }, (_, i) => {
    const word = at(SERVICE_WORDS, i % SERVICE_WORDS.length);
    const n = String(Math.floor(i / SERVICE_WORDS.length) + 1).padStart(2, "0");
    return {
      id: `svc-${String(i + 1).padStart(3, "0")}`,
      name: `${word}-${n}`,
      env: at(SERVICE_ENVS, i % 3),
      status: at(SERVICE_STATUSES, i % 5),
      replicas: (i % 9) + 1,
      region: at(REGIONS, i % REGIONS.length),
      owner: `usr_${(i % 6) + 1}`,
      createdAt: seededIso(90 - Math.floor(i / 2), (i * 7) % 24, (i * 13) % 60),
      updatedAt: seededIso(Math.max(0, 30 - (i % 30)), (i * 5) % 24, (i * 17) % 60),
      version: 1 + (i % 4),
    };
  }).map((row) => ({
    ...row,
    id: `${tenantId === "torchwood" ? "tw" : tenantId === "playground" ? "pg" : "ac"}-${row.id}`,
  }));
}

const AUDIT_ACTIONS = [
  "service.create",
  "service.update",
  "service.delete",
  "service.deploy",
  "member.invite",
  "member.remove",
  "apikey.create",
  "apikey.revoke",
  "settings.update",
] as const;

function seedAuditEvents(tenantId: string): MockAuditEvent[] {
  const prefix = tenantId === "torchwood" ? "tw" : tenantId === "playground" ? "pg" : "ac";
  return Array.from({ length: 320 }, (_, i) => ({
    id: `${prefix}-evt-${String(i + 1).padStart(4, "0")}`,
    action: at(AUDIT_ACTIONS, i % AUDIT_ACTIONS.length),
    actor: `usr_${(i % 6) + 1}`,
    resource:
      i % 3 === 0
        ? `members/usr_${(i % 6) + 1}`
        : `services/${prefix}-svc-${String((i % 120) + 1).padStart(3, "0")}`,
    ip: `10.${(i % 8) + 1}.${(i * 3) % 250}.${(i * 7) % 250}`,
    // 时间递减生成（index 0 最新；keyset 游标按 createdAt desc, id desc 稳定翻页）
    createdAt: new Date(Date.UTC(2026, 9, 21, 8) - i * 137 * 60_000).toISOString(),
  }));
}

// db 上挂 M2 数据集（延迟初始化；租户隔离经 id 前缀）
const tenantServices = new Map<string, MockService[]>();
const tenantAuditEvents = new Map<string, MockAuditEvent[]>();

export function servicesOf(tenantId: string): MockService[] {
  let rows = tenantServices.get(tenantId);
  if (!rows) {
    rows = seedServices(tenantId);
    tenantServices.set(tenantId, rows);
  }
  return rows;
}

export function auditEventsOf(tenantId: string): MockAuditEvent[] {
  let rows = tenantAuditEvents.get(tenantId);
  if (!rows) {
    rows = seedAuditEvents(tenantId);
    tenantAuditEvents.set(tenantId, rows);
  }
  return rows;
}

export function usersForRef(): MockUser[] {
  if (db.users.length > 1) return db.users;
  const extra: MockUser[] = Array.from({ length: 6 }, (_, i) => ({
    id: `usr_${i + 1}`,
    name: at(
      ["Lin Wei", "Aisha Khan", "Diego Marín", "Yuki Tanaka", "Petra Novak", "Sam Okafor"],
      i,
    ),
    email: `user${i + 1}@fleetly.dev`,
    role: "member",
    permissions: [],
  }));
  db.users.push(...extra);
  return db.users;
}

usersForRef();

// ---------------------------------------------------------------------------
// M3：deployments / tasks / api-keys（内存态；deployments 状态由 createdAt 时间推算）
// ---------------------------------------------------------------------------

export interface MockDeployment {
  id: string;
  serviceId: string;
  /** 由 createdAt 时间推算：queued → building → deploying → succeeded/failed */
  status: "queued" | "building" | "deploying" | "succeeded" | "failed";
  replicas: number;
  source: { kind: "git" | "image"; ref: string };
  branch?: string;
  envOverrides: Record<string, string>;
  taskId: string;
  progress: number;
  createdAt: string;
  finishedAt?: string;
  triggeredBy: string;
}

export interface MockTask {
  id: string;
  kind: "deployment" | "generic";
  state: "queued" | "running" | "succeeded" | "failed";
  progress: number;
  error?: string;
  createdAt: number;
  /** 总时长（ms）；到点 succeeded（除非 failMode） */
  durationMs: number;
  failMode?: boolean;
}

export interface MockApiKey {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  expiresAt?: string;
  lastUsedAt?: string;
  /** 一次性 secret：仅在创建响应中出现；内存不落（再次查看不可得） */
  _secretOnce?: string;
}

const tenantDeployments = new Map<string, MockDeployment[]>();
const tenantApiKeys = new Map<string, MockApiKey[]>();
/** 全局 task 注册表（id → MockTask；跨租户共享任务命名空间） */
export const tasks = new Map<string, MockTask>();

export function deploymentsOf(tenantId: string): MockDeployment[] {
  let rows = tenantDeployments.get(tenantId);
  if (!rows) {
    rows = [];
    tenantDeployments.set(tenantId, rows);
  }
  return rows;
}

export function apiKeysOf(tenantId: string): MockApiKey[] {
  let rows = tenantApiKeys.get(tenantId);
  if (!rows) {
    rows = [
      {
        id: "key_legacy",
        name: "legacy-ci-token",
        prefix: "fl_a91f",
        createdAt: seededIso(60, 6, 30),
        lastUsedAt: seededIso(3, 1, 12),
      },
      {
        id: "key_terraform",
        name: "terraform-prod",
        prefix: "fl_7c02",
        createdAt: seededIso(20, 9, 45),
      },
    ];
    tenantApiKeys.set(tenantId, rows);
  }
  return rows;
}

/** task 状态机：queued（<800ms）→ running（progress 线性）→ 终态（durationMs 到点） */
export function taskState(task: MockTask): MockTask {
  const elapsed = Date.now() - task.createdAt;
  if (task.failMode && elapsed >= task.durationMs) {
    return { ...task, state: "failed", progress: 100, error: "部署失败：健康检查未通过（演示）" };
  }
  if (elapsed >= task.durationMs) {
    return { ...task, state: "succeeded", progress: 100 };
  }
  if (elapsed < 800) {
    return { ...task, state: "queued", progress: 0 };
  }
  const ratio = Math.min(0.98, (elapsed - 800) / task.durationMs);
  return { ...task, state: "running", progress: Math.round(ratio * 100) };
}

/** deployment 状态机：由绑定 task 推算（queued/building/deploying → succeeded/failed） */
export function deploymentState(row: MockDeployment): MockDeployment {
  const task = tasks.get(row.taskId);
  if (!task) return row;
  const state = taskState(task);
  if (state.state === "succeeded") {
    return {
      ...row,
      status: "succeeded",
      progress: 100,
      finishedAt: row.finishedAt ?? new Date().toISOString(),
    };
  }
  if (state.state === "failed") {
    return {
      ...row,
      status: "failed",
      progress: state.progress,
      finishedAt: row.finishedAt ?? new Date().toISOString(),
    };
  }
  if (state.state === "queued") {
    return { ...row, status: "queued", progress: 0 };
  }
  return {
    ...row,
    status: state.progress < 40 ? "building" : "deploying",
    progress: state.progress,
  };
}
