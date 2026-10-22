/**
 * prod-preview 翻页回归（renderer 冻结 bug 的守卫用例）。
 *
 * 背景：demo 生产构建（vite build → preview）下点击 services 翻页曾触发「同步渲染
 * 重启循环」——useResourceTable 注入 TanStack Table v9 的受控 state 切片
 * （sorting/pagination/grouping）每次渲染都是新对象身份，useTable 每次提交把
 * options.state 发布进 table 原子 store 时产生快照身份漂移，反复通知订阅者；
 * 与点击路径上 router 的 startTransition 装载链叠加后 React 在 workLoopSync 内
 * 无限重启渲染/提交，页面每周期装卸整棵子树（rAF/setInterval/动画随挂随卸），
 * 主线程饿死 → renderer 冻结。dev（React dev 双渲染吸收漂移 + 未压缩时序）与
 * ?page=2 直链（无 navigate 过渡）都不复现，故必须对 prod preview 构建回归。
 *
 * 修复：core/list useResourceTable 三切片按内容缓存身份（见 packages/core/src/list/index.ts）。
 * 本 spec 跑在独立 playwright project（preview，见 playwright.config.ts），webServer
 * 为 `vite preview`（需先 vite build），与 dev-server 冒烟互不影响。
 */
import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page): Promise<string> {
  await page.goto("/");
  await expect(page).toHaveURL(/\/auth\/sign-in/);
  await page.locator("#signin-email").fill("demo@fleetly.dev");
  await page.locator("#signin-password").fill("e2e-prod-preview");
  await page.getByRole("button", { name: "登录" }).click();
  await expect(page).toHaveURL(/\/t\/[^/]+$/, { timeout: 30_000 });
  return /\/t\/([^/]+)/.exec(new URL(page.url()).pathname)?.[1] ?? "";
}

function rows(page: import("@playwright/test").Page) {
  return page.locator('[data-slot="data-table"] tbody tr');
}

/** 行身份用 id 列文本断言——首列是行选择/展开占位（文本恒空），id 在第二列；
 * 整行文本含活渲染相对时间（"33s ago" 随墙钟漂移），不可用于精确比对 */
function firstRowId(page: import("@playwright/test").Page) {
  return rows(page).first().locator("td").nth(1);
}

test.describe("services prod-preview 翻页（renderer 冻结回归）", () => {
  // 点击「下一页」→ URL 写回 + 表格换页必须在超时内完成；冻结构建上 click 永不返回
  test("点击翻页到第 2 页：URL/行内容更新且页面不冻结", async ({ page }) => {
    test.setTimeout(90_000);
    const tenantId = await login(page);
    await page.goto(`/t/${tenantId}/services`);
    await expect(page.locator('[data-slot="data-table"]')).toBeVisible({ timeout: 30_000 });
    await expect(rows(page)).toHaveCount(30, { timeout: 15_000 });
    const firstRowBefore = await firstRowId(page).textContent();

    await page.getByRole("button", { name: "下一页" }).click();

    // 冻结 = 下列断言全部超时（点击后渲染进程不再响应）
    await expect(page).toHaveURL(/page=2/, { timeout: 15_000 });
    await expect(firstRowId(page)).not.toHaveText(firstRowBefore ?? "", { timeout: 15_000 });
    await expect(page.getByText("第 31–60 条，共 120 条")).toBeVisible({ timeout: 15_000 });

    // 页面仍可交互（renderer 未冻结）：再翻回第 1 页也能完成
    await page.getByRole("button", { name: "上一页" }).click();
    await expect(page).not.toHaveURL(/page=/, { timeout: 15_000 });
    await expect(firstRowId(page)).toHaveText(firstRowBefore ?? "", { timeout: 15_000 });
  });

  // 对照：?page=2 直链载入本就不触发 bug（无 navigate 过渡）——锁住对照行为，
  // 与上一条点击路径形成最小差分（同构建、同数据、不同进入路径）。
  test("对照：?page=2 直接载入第 2 页", async ({ page }) => {
    test.setTimeout(90_000);
    const tenantId = await login(page);
    await page.goto(`/t/${tenantId}/services?page=2`);
    await expect(page.locator('[data-slot="data-table"]')).toBeVisible({ timeout: 30_000 });
    await expect(rows(page)).toHaveCount(30, { timeout: 15_000 });
    await expect(page.getByText("第 31–60 条，共 120 条")).toBeVisible({ timeout: 15_000 });
    await expect(page).toHaveURL(/page=2/);
  });
});
