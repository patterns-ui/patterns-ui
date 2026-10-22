/**
 * ui:shots —— 三态截图基线入口（M7-B2/B4）。
 *
 * 默认：重生成基线（--update-snapshots，本地改版后跑）。
 * --check：CI 校验模式——不更新基线，diff 即失败（等价不带 --update-snapshots 直跑
 * playwright.config.shots.ts；本包装器只为给 `pnpm ui:shots --check` 一个稳定语义）。
 */
import { spawnSync } from "node:child_process";

const check = process.argv.includes("--check");
const args = ["--filter", "demo", "exec", "playwright", "test", "-c", "playwright.config.shots.ts"];
if (!check) args.push("--update-snapshots");

const result = spawnSync("pnpm", args, {
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
