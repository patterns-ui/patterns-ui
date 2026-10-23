import { expect, test } from "@playwright/test";

/**
 * certificates 只读列表主链路（加载 / 过滤进 URL / 翻页）：
 *
 *  - 加载：def.list.pagination.mode="page" + pageSize=10 → 首页 10 行 +
 *    「第 1–10 条，共 42 条」（mock 种子每租户 42 行，状态加权分布见
 *    src/mocks/db.ts seedCertificates）；
 *  - 过滤进 URL：status（multi-select）→ expired 单值 in 过滤扁平化进
 *    status=expired（FilterTree 是唯一事实形态，URL 是承载面）→ 命中恰 6 行；
 *    刷新还原（URL 即事实源）；
 *  - 翻页：移除过滤回全量 → 「下一页」→ page=2 进 URL + 第 11–20 行。
 * 写法参照 filter-tree-url.spec.ts / services-page-size.spec.ts / smoke.spec.ts。
 */

async function loginAndGotoCertificates(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/auth\/sign-in/);
  await page.locator("#signin-email").fill("demo@fleetly.dev");
  await page.locator("#signin-password").fill("e2e-certificates");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/t\/[^/]+$/, { timeout: 30_000 });
  const tenantId = /\/t\/([^/]+)/.exec(new URL(page.url()).pathname)?.[1] ?? "";
  await page.goto(`/t/${tenantId}/certificates`);
  await expect(page.locator('[data-slot="filter-bar"]')).toBeVisible();
  await expect(page.locator('[data-slot="data-table"]')).toBeVisible();
  return tenantId;
}

function rows(page: import("@playwright/test").Page) {
  return page.locator('[data-slot="data-table"] tbody tr');
}

test.describe("certificates 只读列表（page 协议）", () => {
  test("加载 → 状态过滤进 URL（刷新还原）→ 翻页 page=2", async ({ page }) => {
    test.setTimeout(90_000);
    await loginAndGotoCertificates(page);

    // 1) 加载：pageSize=10 首页 10 行 + total=42；状态/时间列头在（def 列配置渲染）
    await expect(rows(page)).toHaveCount(10, { timeout: 15_000 });
    await expect(page.getByText("第 1–10 条，共 42 条")).toBeVisible();
    await expect(page.locator('[data-slot="data-table"] thead', { hasText: "状态" })).toBeVisible();
    await expect(
      page.locator('[data-slot="data-table"] thead', { hasText: "到期时间" }),
    ).toBeVisible();

    // 2) 过滤进 URL：status multi-select → expired（exact：与 expiring 前缀重叠）
    await page.locator('[data-slot="filter-bar"] button', { hasText: "状态" }).click();
    await page.getByRole("menuitemcheckbox", { name: "expired", exact: true }).click();
    await page.keyboard.press("Escape");
    await expect(page).toHaveURL(/status=expired/, { timeout: 10_000 });
    expect(new URL(page.url()).searchParams.get("f")).toBeNull(); // 单值 in 扁平化，不进 f=JSON
    await expect(rows(page)).toHaveCount(6, { timeout: 15_000 });
    await expect(page.getByText("第 1–6 条，共 6 条")).toBeVisible();
    await expect(page.locator('[data-slot="filter-chips"]')).toContainText("状态:");

    // 3) 刷新还原：URL 是事实源，过滤重建
    await page.reload();
    await expect(page.locator('[data-slot="filter-bar"]')).toBeVisible();
    await expect(page).toHaveURL(/status=expired/);
    await expect(rows(page)).toHaveCount(6, { timeout: 15_000 });

    // 4) 翻页：移除过滤回全量 42 行 → 下一页 → page=2 + 第 11–20 行
    await page.getByRole("button", { name: "移除 状态 过滤" }).click();
    await expect(rows(page)).toHaveCount(10, { timeout: 15_000 });
    await page.getByRole("button", { name: "下一页" }).click();
    await expect(page).toHaveURL(/page=2/, { timeout: 10_000 });
    await expect(rows(page)).toHaveCount(10, { timeout: 15_000 });
    await expect(page.getByText("第 11–20 条，共 42 条")).toBeVisible();
  });
});
