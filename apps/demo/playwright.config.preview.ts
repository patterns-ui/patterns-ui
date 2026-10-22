import { defineConfig, devices } from "@playwright/test";

/**
 * prod-preview e2e（独立 config，与 dev-server 冒烟分开跑）：
 *
 * - 只跑 e2e/services-prod-preview.spec.ts（renderer 冻结回归，见该文件头注释）；
 * - webServer 起 `vite preview`（消费 dist，须先 `pnpm --filter demo build`——
 *   构建与 preview 分离让 CI 可以一次构建复用）；
 * - dev 冒烟（playwright.config.ts，vite dev + mock 中间件）继续覆盖其余 spec，
 *   两套各自起服务互不抢端口时机（顺序执行）。
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: /services-prod-preview\.spec\.ts/,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm exec vite preview --port 4173 --strictPort",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
