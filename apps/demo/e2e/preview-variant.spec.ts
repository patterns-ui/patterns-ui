import { expect, test } from "@playwright/test";

/**
 * 预览页变体切换（M6-D 变体收敛）：壳与侧栏收敛为基座 block + variant prop 后，
 * preview 页必须保住 M1「三形态可切换预览」语义 —— 切换即时反映到 DOM
 * （AppShell 根 data-variant / Sidebar 根 data-variant）并落 URL search param。
 *
 * 注意：preview 是全屏舞台（覆盖层），其外层仍有租户布局壳（同为 AppShell）；
 * 断言一律锚定 [data-slot="preview-stage"] 舞台内的壳/侧栏。
 */

async function loginAndGotoPreview(page: import("@playwright/test").Page, path: string) {
  await page.goto("/");
  await expect(page).toHaveURL(/\/auth\/sign-in/);
  await page.locator("#signin-email").fill("demo@fleetly.dev");
  await page.locator("#signin-password").fill("e2e-preview");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/t\/[^/]+$/, { timeout: 30_000 });
  const tenantId = /\/t\/([^/]+)/.exec(new URL(page.url()).pathname)?.[1] ?? "";
  await page.goto(`/t/${tenantId}/${path}`);
  await expect(page.locator('[data-slot="preview-stage"]')).toBeVisible();
}

test.describe("preview 页三形态切换", () => {
  test("壳三 variant（inset/floating/fullbleed）切换即时生效", async ({ page }) => {
    await loginAndGotoPreview(page, "preview");

    // 默认 inset（无 search param 时 catch 回落）
    const shellRoot = page.locator('[data-slot="preview-stage"] [data-slot="sidebar-wrapper"]');
    await expect(shellRoot).toHaveAttribute("data-variant", "inset");

    // 切 floating：壳根 data-variant 变化 + URL 记录
    await page.getByRole("link", { name: "shell: floating" }).click();
    await expect(shellRoot).toHaveAttribute("data-variant", "floating");
    await expect(page).toHaveURL(/shell=floating/);

    // 切 fullbleed：满幅壳
    await page.getByRole("link", { name: "shell: fullbleed" }).click();
    await expect(shellRoot).toHaveAttribute("data-variant", "fullbleed");
    await expect(page).toHaveURL(/shell=fullbleed/);

    // 切回 inset
    await page.getByRole("link", { name: "shell: inset" }).click();
    await expect(shellRoot).toHaveAttribute("data-variant", "inset");
  });

  test("侧栏三 variant（inset/floating/icon）切换即时生效", async ({ page }) => {
    await loginAndGotoPreview(page, "preview");

    // 默认 inset：卡面侧栏（offcanvas 折叠）
    const navRoot = page.locator('[data-slot="preview-stage"] [data-slot="sidebar"]').first();
    await expect(navRoot).toHaveAttribute("data-variant", "inset");

    // 切 floating：悬浮侧栏
    await page.getByRole("link", { name: "sidebar: floating" }).click();
    await expect(navRoot).toHaveAttribute("data-variant", "floating");
    await expect(page).toHaveURL(/sidebar=floating/);

    // 切 icon：平边侧栏（ui Sidebar 原语 variant="sidebar" + collapsible="icon"）
    await page.getByRole("link", { name: "sidebar: icon" }).click();
    await expect(navRoot).toHaveAttribute("data-variant", "sidebar");
    await expect(page).toHaveURL(/sidebar=icon/);
  });

  test("变体组合经 URL 深链还原（shell=floating × sidebar=icon）", async ({ page }) => {
    await loginAndGotoPreview(page, "preview");
    const tenantId = /\/t\/([^/]+)/.exec(new URL(page.url()).pathname)?.[1] ?? "";

    await page.goto(`/t/${tenantId}/preview?shell=floating&sidebar=icon`);
    await expect(page.locator('[data-slot="preview-stage"]')).toBeVisible();
    await expect(
      page.locator('[data-slot="preview-stage"] [data-slot="sidebar-wrapper"]'),
    ).toHaveAttribute("data-variant", "floating");
    await expect(
      page.locator('[data-slot="preview-stage"] [data-slot="sidebar"]').first(),
    ).toHaveAttribute("data-variant", "sidebar");
  });
});
