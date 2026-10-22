import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright 冒烟（M5）：唯一主链路用例见 e2e/smoke.spec.ts。
 *
 * - webServer 起 vite dev（mock API 中间件在 dev 内生效），端口固定 4173；
 * - 本地已起服务时复用（CI 内强制新起）；
 * - Ubuntu 26.04 本机安装浏览器需 `PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64
 *   pnpm exec playwright install chromium`（CI 的 ubuntu-24.04 不需要）。
 */
export default defineConfig({
  testDir: "./e2e",
  // services-prod-preview 只对 prod preview 构建有意义（dev 不复现冻结），由
  // playwright.config.preview.ts 独立执行；states-baseline（三态截图基线，M7-B2）
  // 由 playwright.config.shots.ts 独立执行（确定性环境钉死）。dev 冒烟两者皆排除，
  // 避免同 spec 双跑。
  testIgnore: /(services-prod-preview|states-baseline)\.spec\.ts/,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm exec vite --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
