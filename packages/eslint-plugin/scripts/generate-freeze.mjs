/**
 * 生成 registry 冻结清单 registry/.freeze.json（M7-B1 registry-frozen 规则消费）。
 *
 * 用法：pnpm --filter @patterns-ui/eslint-plugin freeze:regen
 * 确定性：键排序、无时间戳——连跑两次零 diff。再生成 = 豁免动作（PR 附理由）。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildManifest, scanBlocks } from "../src/utils/freeze.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const blocksRoot = path.join(repoRoot, "registry", "blocks");
const manifestPath = path.join(repoRoot, "registry", ".freeze.json");

const current = scanBlocks(blocksRoot);
const manifest = buildManifest(current);
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
console.log(`✓ 冻结清单已生成：registry/.freeze.json（${current.size} blocks）`);
console.log("  提交进 git；改动（新增/改名/移动）后重新生成 = 豁免，PR 须附理由。");
