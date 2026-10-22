/**
 * registry meta 冻结（M7-B1 registry-frozen 规则 + scripts/generate-freeze.mjs 共用单源）。
 *
 * 冻结语义（docs/registry.md §7 / paradigm §6 B1）：路径（block 目录名）、name、targetDir
 * 三不变；内容可变（哈希不冻结）。违规 = 新增/改名/移动 block 未走豁免流程；
 * 豁免 = 重新生成清单（`pnpm --filter @patterns-ui/eslint-plugin freeze:regen`）+ PR 附理由。
 */

import fs from "node:fs";
import path from "node:path";

/**
 * 扫描 blocksRoot 下全部 block 目录（<category>/<block> 两层结构），读其 meta。
 * meta 文件名优先 <block>.meta.json；目录内无同名 meta 时读任意 *.meta.json
 * （目录复制/半改名场景：build.ts 按位置扫描同样会命中，冻结口径须一致）。
 * @param {string} rootAbs blocksRoot 绝对路径
 * @returns {Map<string, { name: string, targetDir: string }>} key = 相对 rootAbs 的目录（`<category>/<block>`）
 */
export function scanBlocks(rootAbs) {
  /** @type {Map<string, { name: string, targetDir: string }>} */
  const map = new Map();
  for (const entry of fs
    .readdirSync(rootAbs, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isDirectory()) continue;
    const categoryDir = path.join(rootAbs, entry.name);
    for (const block of fs.readdirSync(categoryDir, { withFileTypes: true })) {
      if (!block.isDirectory()) continue;
      const blockDir = path.join(categoryDir, block.name);
      const metaPath = findMetaPath(blockDir, block.name);
      if (!metaPath) continue;
      try {
        const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
        map.set(`${entry.name}/${block.name}`, {
          name: String(meta.name),
          targetDir: String(meta.targetDir ?? ""),
        });
      } catch {
        map.set(`${entry.name}/${block.name}`, { name: "", targetDir: "" });
      }
    }
  }
  return map;
}

/**
 * @param {string} blockDir
 * @param {string} blockName
 * @returns {string | null} meta.json 路径（无 meta → null）
 */
function findMetaPath(blockDir, blockName) {
  const canonical = path.join(blockDir, `${blockName}.meta.json`);
  if (fs.existsSync(canonical)) return canonical;
  const anyMeta = fs
    .readdirSync(blockDir)
    .filter((f) => f.endsWith(".meta.json"))
    .sort()[0];
  return anyMeta === undefined ? null : path.join(blockDir, anyMeta);
}

/**
 * 读冻结清单。
 * @param {string} manifestAbs
 * @returns {{ blocks: Record<string, { name: string, targetDir: string }> } | null} 文件不存在 → null
 */
export function readManifest(manifestAbs) {
  if (!fs.existsSync(manifestAbs)) return null;
  const parsed = JSON.parse(fs.readFileSync(manifestAbs, "utf8"));
  return { blocks: parsed.blocks ?? {} };
}

/**
 * 清单 ↔ 现况 的全局差集（目录删除/改名/移动；新增与字段漂移按文件归属另查）。
 * @param {Record<string, { name: string, targetDir: string }>} frozen
 * @param {Map<string, { name: string, targetDir: string }>} current
 * @returns {string[]} 已消失的清单目录（相对 key）
 */
export function missingFrozenDirs(frozen, current) {
  return Object.keys(frozen)
    .filter((key) => !current.has(key))
    .sort();
}

/**
 * 某文件所属 block 目录（结构判定：<category>/<block> 两层；块目录内的深层文件同属该块，
 * 类目根下的散文件不属于任何块）。路径即冻结对象——meta 文件名不参与归属判定。
 * @param {string} rootAbs
 * @param {string} filenameAbs
 * @returns {string | null} 相对 rootAbs 的 key（`<category>/<block>`）
 */
export function owningBlockDir(rootAbs, filenameAbs) {
  const rel = path.relative(rootAbs, filenameAbs);
  if (rel.startsWith("..")) return null;
  const parts = rel.split(path.sep);
  if (parts.length < 2) return null;
  return `${parts[0]}/${parts[1]}`;
}

/**
 * 生成冻结清单对象（确定性：键排序、无时间戳——连跑两次零 diff）。
 * @param {Map<string, { name: string, targetDir: string }>} current
 * @returns {{ "$comment": string, blocks: Record<string, { name: string, targetDir: string }> }}
 */
export function buildManifest(current) {
  /** @type {Record<string, { name: string, targetDir: string }>} */
  const blocks = {};
  for (const key of [...current.keys()].sort()) {
    const meta = current.get(key);
    if (meta) blocks[key] = { name: meta.name, targetDir: meta.targetDir };
  }
  return {
    $comment:
      "registry 冻结清单（M7-B1 registry-frozen）：路径（block 目录名）/name/targetDir 三不变，内容可变（哈希不冻结）。" +
      "新增/改名/移动 block 须重新生成本清单并在 PR 附理由。生成：pnpm --filter @patterns-ui/eslint-plugin freeze:regen。生成物，勿手改。",
    blocks,
  };
}
