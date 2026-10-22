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
// M6-E：确定性 PRNG（mulberry32）替代取模条纹——同租户每次生成完全一致，
//       跨租户经 FNV-1a 种子派生彼此不同（肉眼无重复条纹）。
// ---------------------------------------------------------------------------

/** mulberry32：32 位确定性 PRNG，返回 [0, 1)（种子固定 → 序列可复现） */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 字符串 → 32 位种子（FNV-1a；按 tenantId 派生互不相同的序列） */
function seedFrom(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** [min, max] 闭区间整数 */
function intBetween(rng: () => number, min: number, max: number): number {
  return min + Math.floor(rng() * (max - min + 1));
}

function at<T>(arr: readonly T[], i: number): T {
  const value = arr[i];
  if (value === undefined) {
    throw new Error(`mock seed index out of range: ${i}`);
  }
  return value;
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  const value = arr[Math.floor(rng() * arr.length)];
  if (value === undefined) {
    throw new Error("mock prng pick: empty array");
  }
  return value;
}

/**
 * 种子用户目录（M6-E owner/actor/member 口径统一单源）：
 * `usr_demo`（登录演示账号）+ `usr_1..usr_6`（成员池）。services.owner、
 * audit.actor、notifications.actorId 与 team 成员、/api/users 全部引用同一目录
 * ——id → 姓名在所有端点解析一致。
 */
const SEED_USERS: readonly { id: string; name: string; email: string }[] = [
  { id: "usr_demo", name: "Demo User", email: DEMO_EMAIL },
  { id: "usr_1", name: "Lin Wei", email: "lin@fleetly.dev" },
  { id: "usr_2", name: "Aisha Khan", email: "aisha@fleetly.dev" },
  { id: "usr_3", name: "Diego Marín", email: "diego@fleetly.dev" },
  { id: "usr_4", name: "Yuki Tanaka", email: "yuki@fleetly.dev" },
  { id: "usr_5", name: "Petra Novak", email: "petra@fleetly.dev" },
  { id: "usr_6", name: "Sam Okafor", email: "sam@fleetly.dev" },
];

/** owner/actor 抽样池（usr_1..usr_6；usr_demo 是登录账号不参与业务行归属） */
const SEED_ACTOR_IDS = SEED_USERS.filter((u) => u.id !== "usr_demo").map((u) => u.id);

export interface MockService {
  id: string;
  name: string;
  env: "rep" | "staging" | "prod";
  status: "running" | "degraded" | "stopped";
  replicas: number;
  region: string;
  owner: string; // userId（SEED_USERS 目录口径）
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface MockAuditEvent {
  id: string;
  action: string;
  actor: string; // userId（SEED_USERS 目录口径）
  resource: string; // "services/svc-001"
  ip: string;
  createdAt: string;
}

const SERVICE_ENVS = ["rep", "staging", "prod"] as const;
/** weighted：running 占多数，degraded/stopped 少量 */
const SERVICE_STATUSES = [
  "running",
  "running",
  "running",
  "running",
  "degraded",
  "stopped",
] as const;
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
  // 动态锚点（启动时刻向前推）：数据始终「新鲜」，时间列默认呈现相对时间（如「3 天前」）；
  // hour/minute 参与回退而非前跳，保证结果严格在过去。
  const base = Date.now();
  return new Date(base - dayOffset * 86_400_000 - hour * 3_600_000 - minute * 60_000).toISOString();
}

function seedServices(tenantId: string): MockService[] {
  const rng = mulberry32(seedFrom(`services:${tenantId}`));
  return Array.from({ length: 120 }, (_, i) => {
    const word = at(SERVICE_WORDS, i % SERVICE_WORDS.length);
    const n = String(Math.floor(i / SERVICE_WORDS.length) + 1).padStart(2, "0");
    return {
      id: `svc-${String(i + 1).padStart(3, "0")}`,
      name: `${word}-${n}`,
      env: pick(rng, SERVICE_ENVS),
      status: pick(rng, SERVICE_STATUSES),
      replicas: intBetween(rng, 1, 9),
      region: pick(rng, REGIONS),
      owner: pick(rng, SEED_ACTOR_IDS),
      createdAt: seededIso(90 - Math.floor(i / 2), (i * 7) % 24, (i * 13) % 60),
      // 更新时间分布在 0-7 天内（时间列默认相对形态：今天 / N 天前）
      updatedAt: seededIso(Math.floor((i % 21) / 3), (i * 5) % 24, (i * 17) % 60),
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
  const rng = mulberry32(seedFrom(`audit:${tenantId}`));
  return Array.from({ length: 320 }, (_, i) => {
    const actor = pick(rng, SEED_ACTOR_IDS);
    return {
      id: `${prefix}-evt-${String(i + 1).padStart(4, "0")}`,
      action: pick(rng, AUDIT_ACTIONS),
      actor,
      resource:
        i % 3 === 0
          ? `members/${pick(rng, SEED_ACTOR_IDS)}`
          : `services/${prefix}-svc-${String((i % 120) + 1).padStart(3, "0")}`,
      ip: `10.${(i % 8) + 1}.${(i * 3) % 250}.${(i * 7) % 250}`,
      // 时间递减生成（index 0 最新；keyset 游标按 createdAt desc, id desc 稳定翻页）；锚点动态
      createdAt: new Date(Date.now() - i * 137 * 60_000).toISOString(),
    };
  });
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
  // SEED_USERS 目录单源（M6-E 口径统一）：usr_demo 已在 db.users，补 usr_1..usr_6
  const extra: MockUser[] = SEED_USERS.filter((u) => u.id !== "usr_demo").map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
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
    return { ...task, state: "failed", progress: 100, error: "部署失败：健康检查未通过" };
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

// ---------------------------------------------------------------------------
// M4：members / invitations / notifications / regions（树形）/ metrics（大列表）
// ---------------------------------------------------------------------------

export type MemberRole = "owner" | "admin" | "member" | "viewer";

export interface MockMember {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: MemberRole;
  twoFactorEnabled: boolean;
  joinedAt: string;
}

export interface MockInvitation {
  id: string;
  email: string;
  role: MemberRole;
  invitedBy: string;
  createdAt: string;
  status: "pending" | "accepted" | "revoked";
}

export interface MockNotification {
  id: string;
  type: "deploy" | "alert" | "billing";
  title: string;
  body?: string;
  read: boolean;
  createdAt: string;
  actorId?: string;
}

export interface MockZone {
  id: string;
  name: string;
  services: number;
  loadPct: number;
  status: "healthy" | "degraded" | "offline";
}

export interface MockRegion {
  id: string;
  name: string;
  provider: string;
  zones: MockZone[];
}

export interface MockMetricPoint {
  id: string;
  ts: string;
  cpuPct: number;
  memPct: number;
  reqPerSec: number;
  errRate: number;
}

const tenantMembers = new Map<string, MockMember[]>();
const tenantInvitations = new Map<string, MockInvitation[]>();
const tenantNotifications = new Map<string, MockNotification[]>();
const tenantRegions = new Map<string, MockRegion[]>();
const tenantMetrics = new Map<string, MockMetricPoint[]>();

export function membersOf(tenantId: string): MockMember[] {
  let rows = tenantMembers.get(tenantId);
  if (!rows) {
    // 成员 = SEED_USERS 目录子集（M6-E 口径统一：id/姓名/邮箱与 /api/users 解析一致；
    // usr_demo 是登录账号兼 owner，其余取 usr_1..usr_4）
    const roster: { id: string; role: MemberRole; twoFactor: boolean }[] = [
      { id: "usr_demo", role: "owner", twoFactor: true },
      { id: "usr_1", role: "admin", twoFactor: true },
      { id: "usr_2", role: "member", twoFactor: false },
      { id: "usr_3", role: "member", twoFactor: true },
      { id: "usr_4", role: "viewer", twoFactor: false },
    ];
    rows = roster.map(({ id, role, twoFactor }, i) => {
      const user = SEED_USERS.find((u) => u.id === id);
      if (!user) throw new Error(`mock seed user missing: ${id}`);
      return {
        id,
        name: user.name,
        email: user.email,
        role,
        twoFactorEnabled: twoFactor,
        joinedAt: seededIso(120 - i * 12, (i * 5) % 24, (i * 7) % 60),
      };
    });
    tenantMembers.set(tenantId, rows);
  }
  return rows;
}

export function invitationsOf(tenantId: string): MockInvitation[] {
  let rows = tenantInvitations.get(tenantId);
  if (!rows) {
    rows = [
      {
        id: "inv_pending_1",
        email: "new-hire@fleetly.dev",
        role: "member",
        invitedBy: "usr_demo",
        createdAt: seededIso(2, 3, 12),
        status: "pending",
      },
      {
        id: "inv_pending_2",
        email: "contractor@fleetly.dev",
        role: "viewer",
        invitedBy: "usr_1",
        createdAt: seededIso(5, 9, 40),
        status: "pending",
      },
      {
        id: "inv_accepted_1",
        email: "yuki@fleetly.dev",
        role: "viewer",
        invitedBy: "usr_demo",
        createdAt: seededIso(30, 1, 5),
        status: "accepted",
      },
    ];
    tenantInvitations.set(tenantId, rows);
  }
  return rows;
}

export function notificationsOf(tenantId: string): MockNotification[] {
  let rows = tenantNotifications.get(tenantId);
  if (!rows) {
    // 种子 24 条：deploy/alert/billing 轮转；前 8 条未读；actorId 走 SEED_USERS 目录
    const rng = mulberry32(seedFrom(`notifications:${tenantId}`));
    const templates = [
      { type: "deploy", title: "部署完成", body: "gateway-01 发布 v1.8.2 成功" },
      { type: "alert", title: "CPU 使用率告警", body: "payments-02 连续 5 分钟超过 85%" },
      { type: "billing", title: "账单已出账", body: "本月用量费用 $428.60" },
      { type: "deploy", title: "部署失败", body: "search-03 健康检查未通过" },
      { type: "alert", title: "副本不足", body: "ingest-01 期望 4 副本，当前 2" },
      { type: "billing", title: "额度即将耗尽", body: "构建分钟数剩余 12%" },
    ] as const;
    rows = Array.from({ length: 24 }, (_, i) => {
      const t = at(templates, i % templates.length);
      return {
        id: `ntf-${String(i + 1).padStart(3, "0")}`,
        type: t.type,
        title: t.title,
        body: t.body,
        read: i >= 8,
        createdAt: new Date(Date.now() - i * 47 * 60_000).toISOString(),
        actorId: pick(rng, SEED_ACTOR_IDS),
      };
    });
    tenantNotifications.set(tenantId, rows);
  }
  return rows;
}

export function regionsOf(tenantId: string): MockRegion[] {
  let rows = tenantRegions.get(tenantId);
  if (!rows) {
    const providers = ["aliyun", "tencent", "aws"];
    const regionNames = ["cn-beijing", "cn-shanghai", "cn-hangzhou", "ap-southeast-1", "us-west-2"];
    const zoneStatuses = ["healthy", "healthy", "healthy", "degraded", "offline"] as const;
    const rng = mulberry32(seedFrom(`regions:${tenantId}`));
    rows = regionNames.map((name, r) => ({
      id: `reg-${r + 1}`,
      name,
      provider: at(providers, r % providers.length),
      zones: Array.from({ length: intBetween(rng, 2, 4) }, (_, z) => ({
        id: `reg-${r + 1}-zone-${String.fromCharCode(97 + z)}`,
        name: `${name}-${String.fromCharCode(97 + z)}`,
        services: intBetween(rng, 3, 26),
        loadPct: intBetween(rng, 15, 85),
        status: pick(rng, zoneStatuses),
      })),
    }));
    tenantRegions.set(tenantId, rows);
  }
  return rows;
}

export function metricsPointsOf(tenantId: string): MockMetricPoint[] {
  let rows = tenantMetrics.get(tenantId);
  if (!rows) {
    // 1000 点确定性种子（虚拟化演示用；不翻页一次全给）；锚点动态（最近 1000 分钟）
    const base = Date.now();
    rows = Array.from({ length: 1000 }, (_, i) => ({
      id: `mp-${String(i + 1).padStart(4, "0")}`,
      ts: new Date(base - i * 60_000).toISOString(),
      cpuPct: Math.round((35 + 25 * Math.sin(i / 9) + (i % 13)) % 100),
      memPct: Math.round((48 + 20 * Math.cos(i / 7) + (i % 17)) % 100),
      reqPerSec: 900 + ((i * 37) % 700),
      errRate: Number((((i * 7) % 50) / 1000).toFixed(3)),
    }));
    tenantMetrics.set(tenantId, rows);
  }
  return rows;
}
