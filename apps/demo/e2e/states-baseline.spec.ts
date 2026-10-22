/**
 * 三态截图基线（M7-B2，docs/paradigm.md §6-B2 / §3.2 横切三态）。
 *
 * 页集（写死；选取理由）——四页覆盖四个原型家族的核心宿主：
 *  1. services 列表  /t/acme-web/services        —— resource-list 旗舰：表格/过滤/
 *     分页三态俱全，是回归价值最高的页面；
 *  2. services 详情  /t/acme-web/services/ac-svc-001 —— resource-detail：hero +
 *     sections 骨架与 ErrorState；
 *  3. settings      /t/acme-web/settings         —— settings 原型：节化表单宿主；
 *  4. auth sign-in  /auth/sign-in                —— auth-flow：无壳独立页，演示
 *     会话端点的 chaos 定向（auth 全局豁免外）。
 *
 * 三态构造（逐态）：
 *  - loading：playwright route 拦截对目标 API 延迟 8s（Node 侧 setTimeout，不受
 *    浏览器冻结时钟影响）→ 页面停在骨架/提交中态，断言骨架可见后截图（确定性
 *    优先：延迟窗口远大于断言+截图耗时，数据不可能到达）；
 *  - empty：列表 = ?q=zzz-no-match（空过滤，必无命中 → EmptyState「没有匹配的结果」）；
 *    详情 = 404 不存在 id（detail 无业务空态，404 是其「无数据」边界态）；
 *    settings / auth = 纯初始表单（表单型原型无业务空态，以 pristine 初始态为
 *    「空」基线——同时充当各页默认视觉基线）；
 *  - error：列表/详情 = ?demo-error=services:500（chaos 派发器，见
 *    src/mocks/chaos.ts）；settings = replaceState 追加 ?demo-error=me:500 后提交
 *    改密码（me 定向不能经页面 URL 直接载入——AuthProvider.check 会把 /api/me 5xx
 *    判为未认证跳登录，故先载入会话再挂开关）；auth = ?demo-error=auth:500 提交
 *    登录（auth 属全局豁免资源，定向仍生效）。
 *
 * 确定性三件套：
 *  1. 冻结时钟：page.clock.setFixedTime(EPOCH)（只冻 Date，定时器照常跑——
 *     relative-time 恒定不随墙钟漂移）；mock 种子锚定同一时刻
 *     （POST /api/__e2e/reset?now=EPOCH，见 src/mocks/db.ts nowMs）；
 *  2. 禁动画：prepare() 里 page.emulateMedia({ reducedMotion: "reduce" })
 *     （1.58 的 use: 选项无 reducedMotion 键）+ toHaveScreenshot 默认动画禁用
 *     （animate-pulse/spin 等冻结）；
 *  3. mock 每 worker 重置：每个测试在 prepare() 里调 reset 端点（清内存态重种子，
 *     workers=1 串行）——本仓此前无重置机制，此为 M7-B2 建立。
 *
 * 运行：playwright.config.shots.ts（dev server + 渲染钉死 locale/timezone/viewport）。
 * 基线：e2e/screenshots/baseline/<name>.png（入库）；maxDiffPixelRatio 0.02。
 */
import { type APIRequestContext, expect, type Page, test } from "@playwright/test";

/** 冻结时钟 & 种子锚点（同一时刻；相对时间输出逐像素确定） */
const EPOCH = Date.parse("2026-10-23T08:00:00.000Z");
const DEMO_EMAIL = "demo@fleetly.dev";
const TOKEN_KEY = "demo:token";
const TENANT = "acme-web";

/** 确定性前提三件套：mock 重置 + 程序化登录（token 注入 localStorage）+ 冻结时钟 */
async function prepare(page: Page, request: APIRequestContext, withLogin: boolean): Promise<void> {
  // 2) 禁动画之一：prefers-reduced-motion（另一道防线 = toHaveScreenshot 默认动画禁用）
  await page.emulateMedia({ reducedMotion: "reduce" });

  // 3) mock 重置：清空内存态、种子锚定 EPOCH（免鉴权测试端点，见 plugin.ts）
  const reset = await request.post("/api/__e2e/reset", { params: { now: EPOCH } });
  expect(reset.ok()).toBeTruthy();

  if (withLogin) {
    // 程序化登录：重置清了 token 表，重登拿新 token；addInitScript 在应用脚本前落
    // localStorage（避免 UI 登录交互本身进截图流程）
    const login = await request.post("/api/auth/login", {
      data: { email: DEMO_EMAIL, password: "e2e-shots" },
    });
    expect(login.ok()).toBeTruthy();
    const { token } = (await login.json()) as { token: string };
    await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
      TOKEN_KEY,
      token,
    ] as [string, string]);
  }

  // 1) 冻结时钟（只冻 Date，定时器照常跑：react-query 重试/轮询不受影响）
  await page.clock.setFixedTime(EPOCH);
}

/** loading 态构造：拦截匹配 API 延迟放行（Node 侧 setTimeout，不受页面冻结时钟影响）。
 * URL 匹配须兼容「无查询串」与「?a=b」两种结尾（regex 对整条 URL 生效）。 */
async function delayApi(page: Page, pattern: RegExp, ms = 8_000): Promise<void> {
  await page.route(pattern, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, ms));
    await route.continue();
  });
}

function shot(page: Page, name: string): Promise<void> {
  return expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true });
}

// ---------------------------------------------------------------------------
// services 列表（resource-list）
// ---------------------------------------------------------------------------

test.describe("services 列表三态", () => {
  test("loading：列表 API 延迟 → 表格骨架", async ({ page, request }) => {
    await prepare(page, request, true);
    await delayApi(page, /\/api\/t\/[^/]+\/services($|\?)/);
    await page.goto(`/t/${TENANT}/services`);
    await expect(page.locator('[data-slot="skeleton-table"]')).toBeVisible();
    await shot(page, "services-list-loading");
  });

  test("empty：q=zzz-no-match 空过滤 → 无匹配空态", async ({ page, request }) => {
    await prepare(page, request, true);
    await page.goto(`/t/${TENANT}/services?q=zzz-no-match`);
    await expect(page.locator('[data-slot="empty-state"]')).toBeVisible();
    await expect(page.getByText("没有匹配的结果")).toBeVisible();
    await shot(page, "services-list-empty");
  });

  test("error：?demo-error=services:500 → 服务端错误态", async ({ page, request }) => {
    await prepare(page, request, true);
    await page.goto(`/t/${TENANT}/services?demo-error=services:500`);
    await expect(page.locator('[data-slot="error-state"]')).toBeVisible();
    await expect(page.getByText("服务端错误")).toBeVisible();
    await shot(page, "services-list-error");
  });

  // 附：数据态全量基线（三态之外的默认视图）——唯一含数据行的镜头，冻结时钟 +
  // 种子锚点（relative-time / 绝对回退格式 / status pulse / 头像）在此真正受验。
  test("附：默认数据视图（30 行 + 相对时间列 + facets）", async ({ page, request }) => {
    await prepare(page, request, true);
    await page.goto(`/t/${TENANT}/services`);
    await expect(page.locator('[data-slot="data-table"] tbody tr')).toHaveCount(30);
    await expect(page.getByText("第 1–30 条，共 120 条")).toBeVisible();
    await shot(page, "services-list-loaded");
  });
});

// ---------------------------------------------------------------------------
// services 详情（resource-detail）
// ---------------------------------------------------------------------------

test.describe("services 详情三态", () => {
  test("loading：详情 API 延迟 → hero/sections 骨架", async ({ page, request }) => {
    await prepare(page, request, true);
    // 只延迟单条 GET（不匹配列表 /services 与子资源 /services/:id/deployments）
    await delayApi(page, /\/api\/t\/[^/]+\/services\/[^/]+($|\?)/);
    await page.goto(`/t/${TENANT}/services/ac-svc-001`);
    await expect(page.locator(".animate-pulse").first()).toBeVisible();
    await shot(page, "services-detail-loading");
  });

  test("empty：404 不存在的 id → 「内容不存在」（详情的无数据边界态）", async ({
    page,
    request,
  }) => {
    await prepare(page, request, true);
    await page.goto(`/t/${TENANT}/services/ac-svc-999`);
    await expect(page.locator('[data-slot="error-state"]')).toBeVisible();
    await expect(page.getByText("内容不存在")).toBeVisible();
    await shot(page, "services-detail-empty-404");
  });

  test("error：?demo-error=services:500 → 服务端错误态", async ({ page, request }) => {
    await prepare(page, request, true);
    await page.goto(`/t/${TENANT}/services/ac-svc-001?demo-error=services:500`);
    await expect(page.locator('[data-slot="error-state"]')).toBeVisible();
    await expect(page.getByText("服务端错误")).toBeVisible();
    await shot(page, "services-detail-error");
  });
});

// ---------------------------------------------------------------------------
// settings（settings 原型：节化表单）
// ---------------------------------------------------------------------------

test.describe("settings 三态", () => {
  test("loading：org 详情 API 延迟 → 组织节（可选数据节）pending 隐藏", async ({
    page,
    request,
  }) => {
    await prepare(page, request, true);
    // 只延迟 /api/orgs/:id（TenantProvider 的 /api/orgs 列表不受影响）
    await delayApi(page, /\/api\/orgs\/[^/]+($|\?)/);
    await page.goto(`/t/${TENANT}/settings`);
    await expect(page.getByRole("heading", { name: "个人" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "组织" })).toHaveCount(0);
    await shot(page, "settings-loading");
  });

  test("empty：pristine 初始表单（表单型原型无业务空态，此即「空」基线）", async ({
    page,
    request,
  }) => {
    await prepare(page, request, true);
    await page.goto(`/t/${TENANT}/settings`);
    for (const section of ["组织", "个人", "安全", "会话", "外观"]) {
      await expect(page.getByRole("heading", { name: section })).toBeVisible();
    }
    await shot(page, "settings-empty");
  });

  test("error：改密码提交 × me:500 定向 chaos → 表单服务端错误回显", async ({ page, request }) => {
    await prepare(page, request, true);
    await page.goto(`/t/${TENANT}/settings`);
    await expect(page.getByRole("heading", { name: "安全" })).toBeVisible();

    // me 定向不能经页面 URL 直接载入（AuthProvider.check 会把 /api/me 5xx 判为
    // 未认证跳登录）：先载入会话，再以 replaceState 挂 chaos 开关（api.ts 逐请求
    // 读当前 URL，等价语义）
    await page.evaluate(() => {
      window.history.replaceState(null, "", `${window.location.pathname}?demo-error=me:500`);
    });

    // SecretWidget 的 label 未做 a11y 关联（独立 text 节点）——按安全节内顺序定位
    const securityFields = page
      .locator("section", { has: page.getByRole("heading", { name: "安全" }) })
      .getByRole("textbox");
    await securityFields.nth(0).fill("demo1234");
    await securityFields.nth(1).fill("e2e-chaos-pw");
    await securityFields.nth(2).fill("e2e-chaos-pw");
    await page.getByRole("button", { name: "更新密码" }).click();
    await expect(page.getByRole("alert")).toContainText("模拟错误");
    await shot(page, "settings-error");
  });
});

// ---------------------------------------------------------------------------
// auth sign-in（auth-flow：无壳独立页）
// ---------------------------------------------------------------------------

test.describe("auth sign-in 三态", () => {
  test("loading：登录 API 延迟 → 提交中态（登录中…）", async ({ page, request }) => {
    await prepare(page, request, false);
    await delayApi(page, /\/api\/auth\/login($|\?)/);
    await page.goto("/auth/sign-in");
    await page.locator("#signin-email").fill(DEMO_EMAIL);
    await page.locator("#signin-password").fill("e2e-shots");
    await page.getByRole("button", { name: "登录" }).click();
    await expect(page.getByRole("button", { name: "登录中…" })).toBeVisible();
    await shot(page, "auth-sign-in-loading");
  });

  test("empty：pristine 登录表单（auth 无业务空态，此即「空」基线）", async ({ page, request }) => {
    await prepare(page, request, false);
    await page.goto("/auth/sign-in");
    await expect(page.locator("#signin-email")).toBeVisible();
    await shot(page, "auth-sign-in-empty");
  });

  test("error：?demo-error=auth:500 提交 → 内联错误回显", async ({ page, request }) => {
    await prepare(page, request, false);
    await page.goto("/auth/sign-in?demo-error=auth:500");
    await page.locator("#signin-email").fill(DEMO_EMAIL);
    await page.locator("#signin-password").fill("e2e-shots");
    await page.getByRole("button", { name: "登录" }).click();
    await expect(page.getByRole("alert")).toContainText("模拟错误");
    await shot(page, "auth-sign-in-error");
  });
});
