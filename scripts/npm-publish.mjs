// Release workflow 的 npm publish 闸门：NPM_TOKEN 未配置时静默跳过（tag-only 模式不受影响）。
// 认证由 workflow 的 "Setup npm auth" 步写入 ~/.npmrc；本地手动发布用 npm login。
import { execSync } from "node:child_process";

if (!process.env.NPM_TOKEN) {
  console.log("[release] NPM_TOKEN 未配置 — 跳过 npm publish（tag-only）");
  process.exit(0);
}
execSync("pnpm changeset publish", { stdio: "inherit" });
