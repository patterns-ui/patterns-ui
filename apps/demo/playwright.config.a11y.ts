import { defineConfig } from "@playwright/test";

/**
 * a11y 检查（M7-B4，docs/paradigm.md §6-B4 / §8）：只跑 e2e/a11y.spec.ts
 * （@axe-core/playwright，wcag2a/wcag2aa；serious/critical 违规 = 失败，
 * moderate 及以下报告不失败——口径见 spec 头）。
 *
 * 独立 config 而非并入 dev 冒烟：a11y 归 `pnpm ui:check`（root scripts/ui-check.mjs
 * 第 9 步）编排，不进普通 e2e 套件（playwright.config.ts 的 testIgnore 排除本 spec），
 * 避免拖慢随 PR 的冒烟链路；环境与截图基线同款（vite dev + mock 中间件）。
 *
 * 命令契约（root script）：
 *   pnpm ui:a11y
 *   （等价：pnpm --filter demo exec playwright test -c playwright.config.a11y.ts）
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /a11y\.spec\.ts/,
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
    // 渲染钉死与截图基线同款（locale 影响文案断言；视口影响 axe 可视性判定）
    viewport: { width: 1280, height: 800 },
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
