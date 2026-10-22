/**
 * M6-C 验收（docs/paradigm.md §5-C）：pageSize 单源。
 *
 * services def `list.pageSize=30`（services.index.tsx fixture）是页大小唯一真相：
 *  - URL 无 size → 缺省 30 行（def 直灌 useResourceTable，非 UI 档位反推）；
 *  - `?size=30` 深链 → 每页 30 行（def 直灌路由 schema，30 即使不在缺省档位也合法）；
 *  - `?size=7`（非法档位）→ 钳制回缺省 30 行（单源钳制，不再回落 options[0]/20）。
 *
 * mock 侧：services 种子每租户 120 行（mocks/db.ts seedServices），30/页翻得动。
 */
import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page): Promise<string> {
  await page.goto("/");
  await expect(page).toHaveURL(/\/auth\/sign-in/);
  await page.locator("#signin-email").fill("demo@fleetly.dev");
  await page.locator("#signin-password").fill("e2e-page-size");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/t\/[^/]+$/, { timeout: 30_000 });
  return /\/t\/([^/]+)/.exec(new URL(page.url()).pathname)?.[1] ?? "";
}

function rows(page: import("@playwright/test").Page) {
  return page.locator('[data-slot="data-table"] tbody tr');
}

test.describe("services pageSize 单源（def.list.pageSize=30）", () => {
  test("缺省 30 行 / ?size=30 深链 30 行 / 非法 size 钳制回 30", async ({ page }) => {
    test.setTimeout(90_000);
    const tenantId = await login(page);

    // 1) 缺省：URL 无 size → def.list.pageSize=30 → 每页 30 行，URL 不带 size 噪音
    await page.goto(`/t/${tenantId}/services`);
    await expect(page.locator('[data-slot="data-table"]')).toBeVisible({ timeout: 30_000 });
    await expect(rows(page)).toHaveCount(30, { timeout: 15_000 });
    await expect(page).not.toHaveURL(/size=/);
    await expect(page.getByText("第 1–30 条，共 120 条")).toBeVisible();

    // 2) ?size=30 深链：30 行且 URL 保留 size=30（可分享/刷新还原）
    await page.goto(`/t/${tenantId}/services?size=30`);
    await expect(rows(page)).toHaveCount(30, { timeout: 15_000 });
    await expect(page).toHaveURL(/size=30/);

    // 3) 非法档位 ?size=7：schema catch 兜底 → 钳制回缺省 30（单源钳制，无 20 回落分叉）
    await page.goto(`/t/${tenantId}/services?size=7`);
    await expect(rows(page)).toHaveCount(30, { timeout: 15_000 });
    await expect(page.getByText("第 1–30 条，共 120 条")).toBeVisible();
  });
});
