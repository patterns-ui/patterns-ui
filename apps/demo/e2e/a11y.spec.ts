/**
 * a11y 检查（M7-B4，docs/paradigm.md §6-B4 / §8「a11y 最小机械化集」）。
 *
 * 页集 = 截图基线同款四页减 detail（三页）：services 列表（已登录态，resource-list
 * 旗舰：表格/过滤/分页）+ settings（节化表单宿主）+ auth sign-in（无壳独立页）——
 * 覆盖三个原型家族的核心宿主；detail 页的表单/对话框交互态由 e2e 冒烟与三态截图覆盖。
 *
 * 口径（写死，调整须同步 docs/milestones.md M7-B4）：
 *  - 规则集：axe-core tags wcag2a + wcag2aa（实验性 best-practice 不进判定——误报率高，
 *    机械化集先钉 WCAG 2.x AA 底线）；
 *  - serious / critical 违规 = 测试失败（逐条列节点与修复建议）；
 *  - moderate / minor 违规 = 报告不失败（console 输出 + testInfo annotation，留账不改判）。
 *
 * 运行：playwright.config.a11y.ts（vite dev + mock；登录态经程序化登录注入 token，
 * 与 states-baseline.spec.ts 同法——登录交互本身不进 a11y 判定域）。
 */
import AxeBuilder from "@axe-core/playwright";
import { type APIRequestContext, expect, type Page, type TestInfo, test } from "@playwright/test";

const DEMO_EMAIL = "demo@fleetly.dev";
const TOKEN_KEY = "demo:token";
const TENANT = "acme-web";

const TAGS = ["wcag2a", "wcag2aa"];
const FAILING_IMPACTS = new Set(["serious", "critical"]);

/** 程序化登录（同 states-baseline：token 经 addInitScript 在应用脚本前落 localStorage）。 */
async function login(page: Page, request: APIRequestContext): Promise<void> {
  const reset = await request.post("/api/__e2e/reset");
  expect(reset.ok()).toBeTruthy();
  const login = await request.post("/api/auth/login", {
    data: { email: DEMO_EMAIL, password: "e2e-a11y" },
  });
  expect(login.ok()).toBeTruthy();
  const { token } = (await login.json()) as { token: string };
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
    TOKEN_KEY,
    token,
  ] as [string, string]);
}

/** 扫描并按口径判定：serious/critical 红；moderate/minor 报告留账。 */
async function scan(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  const failing = results.violations.filter(
    (v) => typeof v.impact === "string" && FAILING_IMPACTS.has(v.impact),
  );
  const advisory = results.violations.filter(
    (v) => typeof v.impact !== "string" || !FAILING_IMPACTS.has(v.impact),
  );

  if (advisory.length > 0) {
    const lines = advisory.map(
      (v) => `  [${v.impact ?? "n/a"}] ${v.id}（${v.nodes.length} 节点）：${v.help} — ${v.helpUrl}`,
    );
    const report = `a11y 报告项（不判失败）：${name}\n${lines.join("\n")}`;
    console.log(report);
    await testInfo.attach(`a11y-advisory-${name}`, { body: report, contentType: "text/plain" });
  }

  const formatted = failing.flatMap((v) =>
    v.nodes.map(
      (n) =>
        `[${v.impact}] ${v.id}：${v.help}\n    节点：${n.target.join(" ")}\n    修复：${v.helpUrl}`,
    ),
  );
  expect(formatted, `${name} 的 serious/critical a11y 违规（口径见 spec 头）`).toEqual([]);
}

// ---------------------------------------------------------------------------
// services 列表（resource-list：表格 / 过滤 / 分页；已登录态）
// ---------------------------------------------------------------------------

test.describe("a11y：services 列表", () => {
  test("wcag2a/2aa 扫描（已登录，30 行数据态）", async ({ page, request }, testInfo) => {
    await login(page, request);
    await page.goto(`/t/${TENANT}/services`);
    await expect(page.locator('[data-slot="data-table"] tbody tr')).toHaveCount(30);
    await scan(page, testInfo, "services-list");
  });
});

// ---------------------------------------------------------------------------
// settings（settings 原型：节化表单）
// ---------------------------------------------------------------------------

test.describe("a11y：settings", () => {
  test("wcag2a/2aa 扫描（已登录，pristine 表单）", async ({ page, request }, testInfo) => {
    await login(page, request);
    await page.goto(`/t/${TENANT}/settings`);
    await expect(page.getByRole("heading", { name: "安全" })).toBeVisible();
    await scan(page, testInfo, "settings");
  });
});

// ---------------------------------------------------------------------------
// auth sign-in（auth-flow：无壳独立页）
// ---------------------------------------------------------------------------

test.describe("a11y：auth sign-in", () => {
  test("wcag2a/2aa 扫描（未登录，pristine 表单）", async ({ page, request }, testInfo) => {
    const reset = await request.post("/api/__e2e/reset");
    expect(reset.ok()).toBeTruthy();
    await page.goto("/auth/sign-in");
    await expect(page.locator("#signin-email")).toBeVisible();
    await scan(page, testInfo, "auth-sign-in");
  });
});
