import { expect, test } from "@playwright/test";

/**
 * 过滤树 URL 往返（M6-D）：FilterTree 是过滤器唯一事实形态，URL 是承载面。
 * services 页（facet 资源：env/status）组合 ≥2 字段过滤 →
 * 断言 URL query 反映 FilterTree（flat 参数形态，非 f=JSON 树）→ 刷新后筛选状态还原。
 * 不改 services.index.tsx（def 归 C 并行域），只做页面交互断言。
 */

async function loginAndGotoServices(page: import("@playwright/test").Page) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/auth\/sign-in/);
  await page.locator("#signin-email").fill("demo@fleetly.dev");
  await page.locator("#signin-password").fill("e2e-filter-tree");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/t\/[^/]+$/, { timeout: 30_000 });
  const tenantId = /\/t\/([^/]+)/.exec(new URL(page.url()).pathname)?.[1] ?? "";
  await page.goto(`/t/${tenantId}/services`);
  await expect(page.locator('[data-slot="filter-bar"]')).toBeVisible();
  await expect(page.locator('[data-slot="data-table"]')).toBeVisible();
  return tenantId;
}

test.describe("过滤树 URL 往返还原", () => {
  test("facet 组合（env + status ≥2 字段）→ URL flat 参数 → 刷新还原", async ({ page }) => {
    await loginAndGotoServices(page);

    // 字段 1：env（select 控件）→ prod
    await page.locator('[data-slot="filter-bar"] button', { hasText: "环境" }).click();
    await page.getByRole("option", { name: "prod", exact: true }).click();
    await expect(page).toHaveURL(/env=prod/, { timeout: 10_000 });
    await expect(page.locator('[data-slot="filter-chips"]')).toContainText("环境:");
    await expect(page.locator('[data-slot="filter-chips"]')).toContainText("prod");

    // 字段 2：status（multi-select 控件）→ running
    await page.locator('[data-slot="filter-bar"] button', { hasText: "状态" }).click();
    await page.getByRole("menuitemcheckbox", { name: "running", exact: true }).click();
    await page.keyboard.press("Escape");

    // URL 反映 FilterTree：两字段 flat 参数（canFlatten 时不进 f=JSON 树参数）
    await expect(page).toHaveURL(/status=running/, { timeout: 10_000 });
    await expect(page).toHaveURL(/env=prod/);
    expect(new URL(page.url()).searchParams.get("f")).toBeNull();

    // 过滤生效：chips 展示两字段
    const chips = page.locator('[data-slot="filter-chips"]');
    await expect(chips).toContainText("状态:");
    await expect(chips).toContainText("running");

    // 刷新（URL 即事实源）→ 筛选状态还原：URL 不变 + chips 重建
    await page.reload();
    await expect(page.locator('[data-slot="filter-bar"]')).toBeVisible();
    await expect(page).toHaveURL(/env=prod/);
    await expect(page).toHaveURL(/status=running/);
    await expect(page.locator('[data-slot="filter-chips"]')).toContainText("环境:");
    await expect(page.locator('[data-slot="filter-chips"]')).toContainText("prod");
    await expect(page.locator('[data-slot="filter-chips"]')).toContainText("状态:");
    await expect(page.locator('[data-slot="filter-chips"]')).toContainText("running");

    // 控件侧同样还原：env select 摘要显示 prod（有值时不再显示占位「环境」）
    await expect(
      page.locator('[data-slot="filter-bar"] [data-slot="select-trigger"]', { hasText: "prod" }),
    ).toBeVisible();
  });
});
