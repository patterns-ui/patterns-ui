/**
 * M3 mock 验证脚本（dev server 实跑）：
 * POST 422 字段错误、PUT 409（缺 If-Match + 版本不符）、deployments keyset、
 * task 状态机轮询到终态、api-keys secret 一次性（列表不返回）。
 *
 * 用法：node scripts/verify-m3-mocks.mjs（自带启动/回收 vite dev server）
 */
import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const ROOT = new URL("..", import.meta.url).pathname;
const BASE = "http://localhost:5199";

let server;
let failures = 0;

function check(name, cond, detail = "") {
  const mark = cond ? "PASS" : "FAIL";
  if (!cond) failures += 1;
  console.log(`${mark === "PASS" ? "✓" : "✗"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function api(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(globalThis.__token ? { authorization: `Bearer ${globalThis.__token}` } : {}),
      ...(init.headers ?? {}),
    },
  });
  let body;
  try {
    body = await res.json();
  } catch {
    body = undefined;
  }
  return { status: res.status, body };
}

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const res = await fetch(`${BASE}/`);
      if (res.ok) return true;
    } catch {
      /* retry */
    }
    await sleep(500);
  }
  return false;
}

async function main() {
  server = spawn("pnpm", ["--filter", "demo", "exec", "vite", "--port", "5199", "--strictPort"], {
    cwd: ROOT,
    stdio: "ignore",
    detached: false,
  });
  const up = await waitForServer();
  if (!up) {
    console.error("dev server 未能在 30s 内就绪");
    process.exitCode = 1;
    return;
  }

  // 登录
  const login = await api("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email: "demo@fleetly.dev", password: "demo" }),
  });
  globalThis.__token = login.body?.token;
  check("登录获取 token", login.status === 200 && typeof globalThis.__token === "string");

  // ---- 1. services POST 422 字段错误（{ fields, form } 形状）----
  const bad = await api("/api/t/acme-web/services", {
    method: "POST",
    body: JSON.stringify({
      name: "ab",
      env: "rep",
      replicas: 2,
      region: "cn-beijing",
      owner: "usr_demo",
    }),
  });
  check(
    "POST 422：name<3 → fields.name",
    bad.status === 422 && typeof bad.body?.fields?.name === "string",
    JSON.stringify(bad.body?.fields ?? {}),
  );
  const badEnv = await api("/api/t/acme-web/services", {
    method: "POST",
    body: JSON.stringify({ name: "valid-name", env: "oops" }),
  });
  check(
    "POST 422：env 非法 → fields.env + form",
    badEnv.status === 422 &&
      typeof badEnv.body?.fields?.env === "string" &&
      typeof badEnv.body?.form === "string",
  );

  // 创建合法 service（后续部署/编辑用）
  const created = await api("/api/t/acme-web/services", {
    method: "POST",
    body: JSON.stringify({
      name: "verify-svc",
      env: "staging",
      replicas: 2,
      region: "cn-beijing",
      owner: "usr_demo",
    }),
  });
  check("POST 201 创建 verify-svc", created.status === 201 && created.body?.version === 1);
  const sid = created.body?.id;

  // ---- 2. PUT 409：缺 If-Match 直接 409；版本不符 409；正确版本 200 ----
  const noMatch = await api(`/api/t/acme-web/services/${sid}`, {
    method: "PUT",
    body: JSON.stringify({ name: "verify-svc-2" }),
  });
  check("PUT 缺 If-Match → 409", noMatch.status === 409, noMatch.body?.message);
  const stale = await api(`/api/t/acme-web/services/${sid}`, {
    method: "PUT",
    body: JSON.stringify({ name: "verify-svc-2" }),
    headers: { "if-match": "99" },
  });
  check("PUT If-Match 版本不符 → 409", stale.status === 409, stale.body?.message);
  const good = await api(`/api/t/acme-web/services/${sid}`, {
    method: "PUT",
    body: JSON.stringify({ name: "verify-svc-2" }),
    headers: { "if-match": "1" },
  });
  check("PUT 正确版本 → 200 且 version+1", good.status === 200 && good.body?.version === 2);

  // ---- 3. deployments：POST 触发（{ taskId }）→ task 状态机 → keyset 列表 ----
  const dep = await api(`/api/t/acme-web/services/${sid}/deployments`, {
    method: "POST",
    body: JSON.stringify({ source: { kind: "git", ref: "main" }, branch: "main", replicas: 3 }),
  });
  check("部署 POST 201 → { taskId }", dep.status === 201 && typeof dep.body?.taskId === "string");
  const taskId = dep.body?.taskId;

  const dep422 = await api(`/api/t/acme-web/services/${sid}/deployments`, {
    method: "POST",
    body: JSON.stringify({ source: { kind: "git", ref: "main" } }),
  });
  check(
    "部署 POST 缺分支 → 422 fields.branch",
    dep422.status === 422 && typeof dep422.body?.fields?.branch === "string",
  );

  // 轮询 task 状态机：queued/running → succeeded（≤6s）
  const seenStates = new Set();
  let final;
  for (let i = 0; i < 40; i++) {
    const t = await api(`/api/tasks/${taskId}`);
    if (t.status !== 200) break;
    seenStates.add(t.body?.state);
    final = t.body;
    if (t.body?.state === "succeeded" || t.body?.state === "failed") break;
    await sleep(300);
  }
  check(
    `task 状态机到达终态（观察态：${[...seenStates].join("→")}）`,
    final?.state === "succeeded",
  );

  // 第二条部署（keyset 两页数据）
  await api(`/api/t/acme-web/services/${sid}/deployments`, {
    method: "POST",
    body: JSON.stringify({
      source: { kind: "image", ref: "registry.example.com/app:1.0" },
      replicas: 1,
    }),
  });
  await sleep(5000);

  // keyset：pageSize=1 取两页
  const page1 = await api(`/api/t/acme-web/services/${sid}/deployments?pageSize=1`);
  check(
    "deployments keyset 第 1 页 + nextCursor",
    page1.status === 200 &&
      page1.body?.rows?.length === 1 &&
      typeof page1.body?.nextCursor === "string",
  );
  const page2 = await api(
    `/api/t/acme-web/services/${sid}/deployments?pageSize=1&cursor=${encodeURIComponent(page1.body?.nextCursor ?? "")}`,
  );
  check(
    "deployments keyset 第 2 页（cursor 翻页、无重复）",
    page2.status === 200 &&
      page2.body?.rows?.length >= 1 &&
      page2.body?.rows?.[0]?.id !== page1.body?.rows?.[0]?.id,
  );

  // 行内 PATCH replicas
  const did = page1.body?.rows?.[0]?.id;
  const patched = await api(`/api/t/acme-web/services/${sid}/deployments/${did}`, {
    method: "PATCH",
    body: JSON.stringify({ replicas: 5 }),
  });
  check("部署行内 PATCH replicas=5", patched.status === 200 && patched.body?.replicas === 5);
  const patchBad = await api(`/api/t/acme-web/services/${sid}/deployments/${did}`, {
    method: "PATCH",
    body: JSON.stringify({ replicas: 500 }),
  });
  check("部署 PATCH replicas=500 → 422", patchBad.status === 422);

  // ---- 4. api-keys：POST 一次性 secret；GET 列表永不返回；DELETE ----
  const keyCreated = await api("/api/t/acme-web/api-keys", {
    method: "POST",
    body: JSON.stringify({ name: "verify-key", expiresIn: "30d" }),
  });
  check(
    "api-key 创建返回一次性 secret（fl_ 前缀）",
    keyCreated.status === 201 &&
      typeof keyCreated.body?.secret === "string" &&
      keyCreated.body.secret.startsWith("fl_"),
  );
  const keyId = keyCreated.body?.id;
  const keyList = await api("/api/t/acme-web/api-keys");
  const listed = keyList.body?.rows?.find((k) => k.id === keyId);
  check(
    "api-key 列表不含 secret 字段",
    keyList.status === 200 && listed !== undefined && listed.secret === undefined,
  );
  const keyDeleted = await api(`/api/t/acme-web/api-keys/${keyId}`, { method: "DELETE" });
  check("api-key DELETE → 204", keyDeleted.status === 204);
  const keyGone = await api(`/api/t/acme-web/api-keys/${keyId}`, { method: "DELETE" });
  check("api-key 重复删除 → 404", keyGone.status === 404);

  // ---- 5. users（reference-select 数据源：搜索 + 创建）----
  const users = await api("/api/users?q=lin");
  check("users 搜索 q=lin 命中", users.status === 200 && users.body?.rows?.length >= 1);
  const dupUser = await api("/api/users", {
    method: "POST",
    body: JSON.stringify({ name: "Lin Wei" }),
  });
  check(
    "users 创建重名 → 422 fields.name",
    dupUser.status === 422 && typeof dupUser.body?.fields?.name === "string",
  );

  console.log(failures === 0 ? "\n全部通过" : `\n${failures} 项失败`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    server?.kill("SIGTERM");
  });
