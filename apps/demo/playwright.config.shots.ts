import { defineConfig } from "@playwright/test";

/**
 * 三态截图基线（M7-B2，docs/paradigm.md §6-B2）：只跑 e2e/states-baseline.spec.ts
 * （dev 冒烟 playwright.config.ts 与 prod-preview playwright.config.preview.ts 都
 * 排除本 spec，三套互不重叠）。
 *
 * 环境选择：vite dev（与 dev 冒烟同环境）——chaos 派发器 / e2e reset 端点都在
 * dev 中间件内，确定性由浏览器侧三件套（冻结时钟 / 禁动画 / context 钉死
 * locale+timezone+viewport）+ mock 种子锚点保证，与构建形态无关；dev 免构建成本。
 *
 * 确定性三件套落法（spec 内逐测试执行）：
 *  1. 冻结时钟：page.clock.setFixedTime(EPOCH)（Date 冻结、定时器照常跑——
 *     relative-time 不随墙钟漂移）；mock 种子同锚 POST /api/__e2e/reset?now=EPOCH；
 *  2. 禁动画：spec prepare() 里 page.emulateMedia({ reducedMotion: "reduce" })
 *     （1.58 的 use: 选项无 reducedMotion 键）+ toHaveScreenshot 默认动画禁用；
 *  3. mock 每 worker 重置：每测试在 prepare() 里调 reset 端点（清内存态重种子）。
 *
 * 基线位置：apps/demo/e2e/screenshots/baseline/<快照名>.png（入库；snapshotPathTemplate
 * 固定，无平台/项目后缀——快照名全局唯一）。
 *
 * 命令契约（主会话 root script 用）：
 *  - 生成/更新基线：pnpm --filter demo exec playwright test -c playwright.config.shots.ts --update-snapshots
 *  - CI 校验（--check 语义 = 不带 --update-snapshots：不更新基线，diff 即失败）：
 *    pnpm --filter demo exec playwright test -c playwright.config.shots.ts
 *    （CI 不得设置 --update-snapshots 或环境变量 PLAYWRIGHT_UPDATE_SNAPSHOTS）
 *
 * 本机（Ubuntu 26.04）与 CI（ubuntu-24.04）字体渲染差异：若 CI 首跑 diff 集中在
 * 文本亚像素（字体/DPI 类），在 CI 内用上面「生成基线」命令重写基线并提交一次。
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /states-baseline\.spec\.ts/,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.02 },
  },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  // 基线固定路径（不入 test-results；--update-snapshots 原地重写）。本 config 只跑
  // states-baseline 一个 spec 且快照名全局唯一，无需再按 spec 文件分层。
  snapshotPathTemplate: "{testDir}/screenshots/baseline/{arg}{ext}",
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
    // 渲染钉死：视口/缩放/locale（Intl 日期）/时区（绝对格式回退）/配色；
    // 禁动画两件套的另一半（prefers-reduced-motion）在 spec 的 prepare() 里经
    // page.emulateMedia 设置（1.58 的 use: 选项无 reducedMotion 键）
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    locale: "zh-CN",
    timezoneId: "UTC",
    colorScheme: "dark",
  },
  projects: [{ name: "chromium" }],
  webServer: {
    command: "pnpm exec vite --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
