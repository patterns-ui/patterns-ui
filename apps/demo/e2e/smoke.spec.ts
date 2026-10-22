/**
 * demo 冒烟主链路（M5，docs/milestones.md M5-3）：
 *
 * 打开 / → 守卫跳登录 → 登录（demo@fleetly.dev）→ 进壳 → Services 列表搜索过滤（URL 事实源）
 * → 翻页 → 详情 → 返回（URL 状态还原）→ 新建表单（dirty guard 确认离开）→ undoable 删除 + 撤销。
 *
 * 选择器尽量用 aria-label / role / 占位符（与 blocks 的可访问性约定一致），不依赖 DOM 顺序细节。
 */
import { expect, test } from "@playwright/test";

test.describe("冒烟主链路", () => {
  test("登录 → 列表过滤分页 → 详情 → 表单 dirty guard → undoable 删除撤销", async ({ page }) => {
    test.setTimeout(120_000);

    // 1) 未登录访问根路径：requireAuth 守卫跳登录并带 next
    await page.goto("/");
    await expect(page).toHaveURL(/\/auth\/sign-in/);
    await expect(page.locator("#signin-email")).toBeVisible();

    // 2) 登录（demo 账号，任意密码）→ 回跳 → 落进租户壳（/t/<tenantId>）
    await page.locator("#signin-email").fill("demo@fleetly.dev");
    await page.locator("#signin-password").fill("e2e-smoke");
    await page.getByRole("button", { name: "登录" }).click();
    await expect(page).toHaveURL(/\/t\/[^/]+$/, { timeout: 30_000 });

    // 3) 侧栏进 Services 列表
    await page.getByRole("link", { name: "Services" }).first().click();
    await expect(page).toHaveURL(/\/services$/);
    await expect(page.locator('[data-slot="data-table"]')).toBeVisible();

    // 4) 翻页：page=2 进 URL
    await page.getByRole("button", { name: "下一页" }).click();
    await expect(page).toHaveURL(/page=2/);

    // 5) 搜索过滤：防抖后 q 进 URL；过滤变化回第 1 页（page 参数被清除）
    const search = page.getByPlaceholder(/^搜索/);
    await search.fill("gateway");
    await expect(page).toHaveURL(/q=gateway/, { timeout: 10_000 });
    await expect(page).not.toHaveURL(/page=/);
    await expect(page.getByText("gateway-01").first()).toBeVisible();

    // 6) 详情（深链，行 id 从首行 id 单元格读取）→ 返回列表：URL 过滤还原
    const tenantId = /\/t\/([^/]+)/.exec(new URL(page.url()).pathname)?.[1] ?? "";
    const rowId = (
      await page
        .getByText(/^[a-z]{2}-svc-\d{3}$/)
        .first()
        .textContent()
    )?.trim();
    await page.goto(`/t/${tenantId}/services/${rowId}`);
    await expect(page.getByText("gateway-01").first()).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(/q=gateway/);

    // 7) 新建表单：打开 → 改名称变脏 → 侧栏导航触发 dirty guard → 确认离开
    await page.getByRole("link", { name: "新建服务" }).click();
    await expect(page).toHaveURL(/\/services\/new$/);
    await page.getByRole("textbox").first().fill("e2e-冒烟-临时服务");
    await page.getByRole("link", { name: "Team" }).first().click();
    const guardDialog = page.getByRole("dialog");
    await expect(guardDialog.getByText("有未保存的修改")).toBeVisible({ timeout: 10_000 });
    await guardDialog.getByRole("button", { name: "离开" }).click();
    await expect(page).toHaveURL(/\/team$/);

    // 8) undoable 删除：更多操作菜单删除 → toast 撤销 → 行恢复（主操作 查看/编辑 平铺在行内）
    await page.getByRole("link", { name: "Services" }).first().click();
    await expect(page.locator('[data-slot="data-table"]')).toBeVisible();
    await expect(page.getByText("gateway-01").first()).toBeVisible();

    await expect(page.getByRole("button", { name: "查看", exact: true }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "编辑", exact: true }).first()).toBeVisible();

    await page.getByRole("button", { name: "更多操作" }).first().click();
    await page.getByRole("menuitem", { name: /删除（可撤销）/ }).click();
    await expect(page.getByText("gateway-01").first()).toHaveCount(0, { timeout: 10_000 }); // 立即消失
    const undoButton = page.getByRole("button", { name: /撤销（\d+s）/ });
    await undoButton.click();
    await expect(page.getByText("gateway-01").first()).toBeVisible({ timeout: 10_000 }); // 撤销恢复
  });

  test("1280×800：表格横向滚动时行操作尾列始终可见（sticky）", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.goto("/");
    await page.locator("#signin-email").fill("demo@fleetly.dev");
    await page.locator("#signin-password").fill("e2e-sticky");
    await page.getByRole("button", { name: "登录" }).click();
    await expect(page).toHaveURL(/\/t\/[^/]+$/, { timeout: 30_000 });

    await page.getByRole("link", { name: "Services" }).first().click();
    const tableSlot = page.locator('[data-slot="data-table"]');
    await expect(tableSlot).toBeVisible();

    // 滚动容器是 data-table 内唯一的 overflow-x-auto（ui/table 不再自带，避免双 scrollport 破坏 sticky）
    const scrollInfo = await tableSlot.evaluate((el) => {
      const scroller = el.querySelector<HTMLElement>("div.overflow-x-auto");
      if (!scroller) return null;
      return {
        scrollWidth: scroller.scrollWidth,
        clientWidth: scroller.clientWidth,
      };
    });
    expect(scrollInfo).not.toBeNull();

    const actionsBox = await page.locator('th:has(.sr-only:text("操作"))').first().boundingBox();
    expect(actionsBox).not.toBeNull();
    if (actionsBox) {
      // 尾列（行操作）右缘不得超出视口 —— 未滚动时也可见
      expect(actionsBox.x + actionsBox.width).toBeLessThanOrEqual(1280);
    }

    if (scrollInfo && scrollInfo.scrollWidth > scrollInfo.clientWidth) {
      // 横向溢出真实存在：滚到最右，行操作列必须仍钉在视口内（sticky right）
      await tableSlot.evaluate((el) => {
        const scroller = el.querySelector<HTMLElement>("div.overflow-x-auto");
        if (scroller) scroller.scrollLeft = scroller.scrollWidth;
      });
      await page.waitForTimeout(150);
      const scrolled = await page.locator('th:has(.sr-only:text("操作"))').first().boundingBox();
      expect(scrolled).not.toBeNull();
      if (scrolled) {
        expect(scrolled.x + scrolled.width).toBeLessThanOrEqual(1280);
        expect(scrolled.x).toBeGreaterThanOrEqual(0);
      }
    }

    await page.screenshot({ path: "test-results/services-1280x800.png", fullPage: false });
  });
});
