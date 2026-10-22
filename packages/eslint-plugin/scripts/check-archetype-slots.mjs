/**
 * archetype slot 一致性校验（M7-B1，paradigm §3.2「CI 校验同原型 slot 结构一致」）。
 *
 * 三方一致：registry meta（archetype 声明）↔ core/vocab BLOCKS_BY_ARCHETYPE（宿主/预设，
 * 由 vocab:generate 从 meta 生成）↔ core/page PAGE_SLOT_FILLS + SLOT_NAMES_BY_ARCHETYPE
 * （A2 手写域表）。失败输出列全表（报错即目录哲学）。
 *
 * 用法：pnpm --filter @patterns-ui/eslint-plugin check:slots
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PAGE_SLOT_FILLS, SLOT_NAMES_BY_ARCHETYPE } from "../../core/src/page/blocks.ts";
import {
  ARCHETYPES,
  BLOCK_NAMES,
  BLOCKS_BY_ARCHETYPE,
} from "../../core/src/vocab/blocks.generated.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const blocksRoot = path.join(repoRoot, "registry", "blocks");

/** 字面量联合数组的 string 查询（直接 .includes 会按元素类型收窄参数） */
const ARCHETYPE_SET = new Set(/** @type {readonly string[]} */ (ARCHETYPES));
const BLOCK_NAME_SET = new Set(/** @type {readonly string[]} */ (BLOCK_NAMES));

/** @type {{ dir: string, name: string, targetDir: string, archetype?: string }[]} */
const metas = [];
/** @type {string[]} */
const errors = [];

for (const category of fs.readdirSync(blocksRoot, { withFileTypes: true })) {
  if (!category.isDirectory()) continue;
  const categoryDir = path.join(blocksRoot, category.name);
  for (const block of fs.readdirSync(categoryDir, { withFileTypes: true })) {
    if (!block.isDirectory()) continue;
    const dir = `${category.name}/${block.name}`;
    const metaPath = path.join(categoryDir, block.name, `${block.name}.meta.json`);
    if (!fs.existsSync(metaPath)) {
      errors.push(`${dir}：缺 ${block.name}.meta.json`);
      continue;
    }
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8"));
      if (meta.name !== block.name) {
        errors.push(`${dir}：meta.name「${meta.name}」≠ 目录名「${block.name}」（path 冻结锚点）`);
      }
      if (typeof meta.targetDir !== "string" || meta.targetDir === "") {
        errors.push(`${dir}：meta.targetDir 缺失`);
      }
      if (meta.archetype !== undefined && !ARCHETYPE_SET.has(meta.archetype)) {
        errors.push(
          `${dir}：meta.archetype「${meta.archetype}」非法；合法值：[${ARCHETYPES.join(", ")}]（paradigm §3.2）`,
        );
      }
      metas.push({
        dir,
        name: String(meta.name),
        targetDir: String(meta.targetDir ?? ""),
        archetype: meta.archetype,
      });
    } catch (error) {
      errors.push(`${dir}：meta.json 解析失败（${String(error)}）`);
    }
  }
}

/** @param {readonly string[]} names */
const dedup = (names) => [...new Set(names)].sort();

const vocabHosts = BLOCKS_BY_ARCHETYPE;
for (const arch of ARCHETYPES) {
  const metaHosts = dedup(metas.filter((m) => m.archetype === arch).map((m) => m.name));
  const vocabHostsForArch = dedup(vocabHosts[arch] ?? []);
  for (const name of vocabHostsForArch) {
    if (!metaHosts.includes(name)) {
      errors.push(
        `BLOCKS_BY_ARCHETYPE[${arch}] 含「${name}」但无对应 meta.archetype 声明（镜像断裂）`,
      );
    }
  }
  for (const name of metaHosts) {
    if (!vocabHostsForArch.includes(name)) {
      errors.push(
        `meta「${name}」声明 archetype=${arch} 但不在 BLOCKS_BY_ARCHETYPE[${arch}]（漏跑 vocab:generate？）`,
      );
    }
  }
}

/** @param {Record<string, readonly string[]>} table @param {string} label */
function checkKeySet(table, label) {
  const keys = Object.keys(table).sort();
  for (const key of keys) {
    if (!ARCHETYPE_SET.has(key)) {
      errors.push(`${label} 含非法原型键「${key}」；合法值：[${ARCHETYPES.join(", ")}]`);
    }
  }
  for (const arch of ARCHETYPES) {
    if (!(arch in table)) errors.push(`${label} 缺原型「${arch}」的条目（三方一致要求全覆盖）`);
  }
}

checkKeySet(/** @type {any} */ (vocabHosts), "BLOCKS_BY_ARCHETYPE");
checkKeySet(/** @type {any} */ (PAGE_SLOT_FILLS), "PAGE_SLOT_FILLS");
checkKeySet(/** @type {any} */ (SLOT_NAMES_BY_ARCHETYPE), "SLOT_NAMES_BY_ARCHETYPE");

for (const arch of ARCHETYPES) {
  for (const name of vocabHosts[arch] ?? []) {
    if (!BLOCK_NAME_SET.has(name)) {
      errors.push(`BLOCKS_BY_ARCHETYPE[${arch}] 的「${name}」不在 BLOCK_NAMES（悬空名）`);
    }
  }
  for (const name of PAGE_SLOT_FILLS[arch] ?? []) {
    if (!BLOCK_NAMES.includes(name)) {
      errors.push(
        `PAGE_SLOT_FILLS[${arch}] 的「${name}」不在 BLOCK_NAMES（悬空名——引用不存在的 block）`,
      );
    }
  }
}

// 词表新鲜度：BLOCK_NAMES ↔ meta 名集双向（漏跑 vocab:generate 在此即红，不必等 CI regen diff）
const metaNames = dedup(metas.map((m) => m.name));
const metaNameSet = new Set(metaNames);
for (const name of metaNames) {
  if (!BLOCK_NAME_SET.has(name))
    errors.push(`meta「${name}」未进 BLOCK_NAMES（漏跑 vocab:generate？）`);
}
for (const name of BLOCK_NAMES) {
  if (!metaNameSet.has(name)) errors.push(`BLOCK_NAMES 的「${name}」无对应 meta（生成物过期？）`);
}

/** 失败输出列全表（报错即目录） */
function printTables() {
  console.log("── archetype 域表（三方）───────────────────────────");
  for (const arch of ARCHETYPES) {
    console.log(`  ${arch}`);
    console.log(
      `    meta.archetype 声明 : ${dedup(metas.filter((m) => m.archetype === arch).map((m) => m.name)).join(", ") || "—"}`,
    );
    console.log(`    BLOCKS_BY_ARCHETYPE : ${(vocabHosts[arch] ?? []).join(", ") || "—"}`);
    console.log(`    PAGE_SLOT_FILLS     : ${(PAGE_SLOT_FILLS[arch] ?? []).join(", ") || "—"}`);
    console.log(
      `    SLOT_NAMES          : ${(SLOT_NAMES_BY_ARCHETYPE[arch] ?? []).join(", ") || "—"}`,
    );
  }
  console.log("───────────────────────────────────────────────────");
}

if (errors.length > 0) {
  printTables();
  console.error(`✗ archetype/slot 三方一致校验失败（${errors.length} 处）：`);
  for (const error of errors) {
    console.error(`  - ${error}`);
  }
  process.exitCode = 1;
} else {
  const hosts = ARCHETYPES.reduce((n, arch) => n + (vocabHosts[arch]?.length ?? 0), 0);
  const fills = ARCHETYPES.reduce((n, arch) => n + (PAGE_SLOT_FILLS[arch]?.length ?? 0), 0);
  console.log(
    `✓ archetype/slot 三方一致：${metas.length} blocks（宿主/预设 ${hosts}，slot 填充 ${fills}），7 原型域表全覆盖，无悬空名。`,
  );
}
