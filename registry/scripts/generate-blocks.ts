/**
 * 词表生成器（docs/paradigm.md §3.3 封闭词表、§6 M7-A1；docs/registry.md §3）。
 *
 * 行为：
 *  1. 扫描 registry/blocks 下全部 *.meta.json 与 registry/themes/*.json（排除 .css）。
 *  2. 产出 packages/core/src/vocab/blocks.generated.ts——**生成物提交进 git**
 *     （TanStack Router routeTree.gen.ts 同模式：IDE/CI 无需先跑生成器即可 typecheck）。
 *
 * 生成形态（paradigm.md §3.3 (2) 定案，勿改）：
 *  - 每个词表 = `export const X_NAMES = [...] as const;` + `export type XName = (typeof X_NAMES)[number];`
 *    ——派生联合在 typecheck 报错里**展开全部合法值**（报错信息即目录）；别名直写的字面量联合
 *    只显示别名与最近候选（TS2820），不满足验收。`as const` 元组内为显式字面量，无推断歧义
 *    （防 TS2742 跨包推断失败的目的等同达成）。
 *  - 每个名字行上方带 `/** meta description *\/` JSDoc（IDE 补全面）；另生成
 *    `X_DOCS: Record<XName, string>`（= meta description，供 patterns.md/AGENTS.md 生成器
 *    与 ui:check 工具消费——JSDoc 是人的面，DOCS 是工具的面，单源都是 meta）。
 *  - 确定性：名字按码位排序、固定分节顺序，连跑两次零 diff；CI 以 git diff 校验新鲜度。
 *
 * 词表构成：
 *  - ARCHETYPES：7 个页面原型（§3.2，文档表序为输出序，与 meta 无关的常量）。
 *  - CELL_NAMES：registry/blocks/cells/* 全部 block，**排除 cell-for**（映射器工厂不是可渲染
 *    cell；cell-for 仍进 BLOCK_NAMES）。
 *  - BLOCK_NAMES：全部 block 名（含 cell-for，不含 theme）。
 *  - BLOCKS_BY_ARCHETYPE：来自 meta.archetype 的宿主/预设归属（M7-A2 的
 *    definePage<Archetype> 经 BlockNameFor 消费；M7-B1 消费做同原型 slot 一致性校验）。
 *  - THEME_PRESET_NAMES：registry/themes/*.json 的 name。
 *
 * 运行：pnpm vocab:generate（tsx）。
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BLOCKS_DIR = join(ROOT, "registry", "blocks");
const THEMES_DIR = join(ROOT, "registry", "themes");
const OUT_FILE = join(ROOT, "packages", "core", "src", "vocab", "blocks.generated.ts");

/** 与 registry/scripts/build.ts 的 ARCHETYPES 同源（两处硬编码，改原型属 §2.2 象限变更纪律） */
const ARCHETYPES = [
  "resource-list",
  "resource-detail",
  "resource-form",
  "settings",
  "overview",
  "auth-flow",
  "wizard",
] as const;
/** cells 命名空间目录名（registry/blocks 下第一段路径） */
const CELLS_CATEGORY = "cells";
/** 映射器工厂：进 BLOCK_NAMES 不进 CELL_NAMES（cellFor 产出的是组件映射，不是可渲染 cell） */
const NON_RENDERABLE_CELL = "cell-for";
/** biome formatter 行宽（biome.json lineWidth）——决定 BLOCKS_BY_ARCHETYPE 行内/展开形态 */
const LINE_WIDTH = 100;

interface BlockMeta {
  name: string;
  type?: string;
  title?: string;
  description?: string;
  /** 页面原型（7 合法值，见 ARCHETYPES）；仅原型的宿主/预设 block 声明 */
  archetype?: string;
}

interface ThemeDef {
  name: string;
  label: string;
  description?: string;
}

interface BlockEntry {
  /** registry/blocks 下的相对目录（如 "cells/cell-boolean"） */
  key: string;
  /** 第一段路径 = 命名空间（cells / form / list / …） */
  category: string;
  meta: BlockMeta;
  metaPath: string;
}

function fail(message: string): never {
  console.error(`vocab:generate — ${message}`);
  process.exit(1);
}

function listFilesRecursive(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

function collectBlocks(): BlockEntry[] {
  const metaFiles = listFilesRecursive(BLOCKS_DIR).filter((file) => file.endsWith(".meta.json"));
  if (metaFiles.length === 0) {
    fail("no *.meta.json found under registry/blocks");
  }
  const blocks: BlockEntry[] = [];
  const seen = new Map<string, string>();
  for (const metaPath of metaFiles.sort()) {
    const meta = JSON.parse(readFileSync(metaPath, "utf8")) as BlockMeta;
    if (!meta.name) {
      fail(`${relative(ROOT, metaPath)}: name is required`);
    }
    if (seen.has(meta.name)) {
      fail(
        `duplicate block name "${meta.name}" (${seen.get(meta.name)} and ${relative(ROOT, metaPath)})`,
      );
    }
    seen.set(meta.name, relative(ROOT, metaPath));
    const key = relative(BLOCKS_DIR, dirname(metaPath));
    if (
      meta.archetype !== undefined &&
      !(ARCHETYPES as readonly string[]).includes(meta.archetype)
    ) {
      fail(
        `${relative(ROOT, metaPath)}: archetype "${meta.archetype}" is not one of ${ARCHETYPES.join(", ")}`,
      );
    }
    blocks.push({ key, category: key.split("/")[0] ?? key, meta, metaPath });
  }
  return blocks;
}

function collectThemePresetNames(): string[] {
  const themeFiles = readdirSync(THEMES_DIR).filter(
    (file) => file.endsWith(".json") && !file.endsWith(".meta.json"),
  );
  const names: string[] = [];
  for (const file of themeFiles.sort()) {
    const theme = JSON.parse(readFileSync(join(THEMES_DIR, file), "utf8")) as ThemeDef;
    if (!theme.name) {
      fail(`${relative(ROOT, join(THEMES_DIR, file))}: name is required`);
    }
    names.push(theme.name);
  }
  return names.sort();
}

/** 描述文案：meta.description 优先，回落 title/name（词表内不允许缺描述行） */
function docOf(meta: BlockMeta): string {
  return meta.description ?? meta.title ?? meta.name;
}

/** JSDoc 安全化：注释体内出现 `*\/` 会提前终止注释，替换为 `* /`（DOCS 常量仍保留原文） */
function jsdocSafe(text: string): string {
  return text.replace(/\*\//g, "* /").replace(/\r?\n/g, " ");
}

function tsString(text: string): string {
  return JSON.stringify(text);
}

/**
 * 名字表分节：`/** desc *\/` 逐名注释 + as const 元组 + 派生联合 + DOCS 映射。
 * 逐名注释使元组必然多行（每名一行），biome format 不会折叠带注释的数组。
 */
function emitVocabSection(names: {
  constName: string;
  typeName: string;
  docsName: string | null;
  tableDoc: string;
  typeDoc: string;
  docsDoc: string | null;
  entries: { name: string; doc: string }[];
}): string {
  const lines: string[] = [];
  lines.push(`/** ${names.tableDoc} */`);
  lines.push(`export const ${names.constName} = [`);
  for (const entry of names.entries) {
    lines.push(`  /** ${jsdocSafe(entry.doc)} */`);
    lines.push(`  ${tsString(entry.name)},`);
  }
  lines.push("] as const;");
  lines.push("");
  lines.push(`/** ${names.typeDoc} */`);
  lines.push(`export type ${names.typeName} = (typeof ${names.constName})[number];`);
  if (names.docsName && names.docsDoc) {
    lines.push("");
    lines.push(`/** ${names.docsDoc} */`);
    lines.push(`export const ${names.docsName}: Record<${names.typeName}, string> = {`);
    for (const entry of names.entries) {
      lines.push(`  ${tsString(entry.name)}: ${tsString(entry.doc)},`);
    }
    lines.push("};");
  }
  return lines.join("\n");
}

/** BLOCKS_BY_ARCHETYPE 成员行：短列表行内（≤ biome lineWidth），超宽则逐名一行 */
function emitArchetypeMember(archetype: string, blockNames: string[]): string {
  const inline = `  ${tsString(archetype)}: [${blockNames.map(tsString).join(", ")}],`;
  if (inline.length <= LINE_WIDTH) {
    return inline;
  }
  return [
    `  ${tsString(archetype)}: [`,
    ...blockNames.map((name) => `    ${tsString(name)},`),
    "  ],",
  ].join("\n");
}

function generate(blocks: BlockEntry[], themePresetNames: string[]): string {
  const cellEntries = blocks
    .filter((block) => block.category === CELLS_CATEGORY && block.meta.name !== NON_RENDERABLE_CELL)
    .map((block) => ({ name: block.meta.name, doc: docOf(block.meta) }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const blockEntries = blocks
    .map((block) => ({ name: block.meta.name, doc: docOf(block.meta) }))
    .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));

  const byArchetype = new Map<string, string[]>(ARCHETYPES.map((archetype) => [archetype, []]));
  for (const block of blocks) {
    if (block.meta.archetype) {
      byArchetype.get(block.meta.archetype)?.push(block.meta.name);
    }
  }
  for (const names of byArchetype.values()) {
    names.sort();
  }

  const out: string[] = [
    "// Generated by pnpm vocab:generate — do not edit.",
    "// 源：registry/blocks/**/*.meta.json + registry/themes/*.json（docs/paradigm.md §3.3、M7-A1）。",
    "// 形态：as const 元组 + (typeof X)[number] 派生联合——报错信息展开全部合法值（报错信息即目录），",
    "// 显式字面量无推断歧义（防 TS2742）；逐名 JSDoc + *_DOCS 描述映射；连跑两次零 diff。",
    "",
    "/** 页面原型封闭词表（paradigm.md §3.2，7 值，表序即输出序） */",
    "export const ARCHETYPES = [",
    ...ARCHETYPES.map((archetype) => `  ${tsString(archetype)},`),
    "] as const;",
    "",
    "/** 页面原型（七选一；判别式见 paradigm.md §3.2） */",
    "export type Archetype = (typeof ARCHETYPES)[number];",
    "",
  ];

  out.push(
    emitVocabSection({
      constName: "CELL_NAMES",
      typeName: "CellName",
      docsName: "CELL_DOCS",
      tableDoc: "可渲染 cell 名字表（registry/blocks/cells/* 全部 block，排除映射器工厂 cell-for）",
      typeDoc: "cell 封闭词表：写错名字由 typecheck 报错并列出全部合法值（报错信息即目录）",
      docsDoc: "cell 描述映射（= meta description；patterns.md/AGENTS.md 生成器与 ui:check 消费）",
      entries: cellEntries,
    }),
  );
  out.push("");
  out.push(
    emitVocabSection({
      constName: "BLOCK_NAMES",
      typeName: "BlockName",
      docsName: "BLOCK_DOCS",
      tableDoc: "block 名字表（registry/blocks 全部 block，含 cell-for；不含 theme）",
      typeDoc: "block 封闭词表：写错名字由 typecheck 报错并列出全部合法值（报错信息即目录）",
      docsDoc: "block 描述映射（= meta description；patterns.md/AGENTS.md 生成器与 ui:check 消费）",
      entries: blockEntries,
    }),
  );
  out.push("");

  out.push(
    [
      "/** 各原型名下的宿主/预设 block（来自 meta.archetype；overview 待 M8 dashboard-page） */",
      "export const BLOCKS_BY_ARCHETYPE = {",
      ...ARCHETYPES.map((archetype) =>
        emitArchetypeMember(archetype, byArchetype.get(archetype) ?? []),
      ),
      "} as const satisfies Record<Archetype, readonly BlockName[]>;",
      "",
      "/** 按原型收窄的合法 block 名（M7-A2 的 definePage<Archetype> 消费） */",
      "export type BlockNameFor<A extends Archetype> = Extract<",
      "  BlockName,",
      "  (typeof BLOCKS_BY_ARCHETYPE)[A][number]",
      ">;",
    ].join("\n"),
  );
  out.push("");

  out.push(
    [
      "/** 主题 preset 名字表（registry/themes/*.json 的 name） */",
      "export const THEME_PRESET_NAMES = [",
      ...themePresetNames.map((name) => `  ${tsString(name)},`),
      "] as const;",
      "",
      "/** 主题 preset 封闭词表（core /theme 的 setPreset 与 preset-switcher 消费） */",
      "export type ThemePresetName = (typeof THEME_PRESET_NAMES)[number];",
    ].join("\n"),
  );
  out.push("");
  return out.join("\n");
}

function main(): void {
  const blocks = collectBlocks();
  const themePresetNames = collectThemePresetNames();
  const source = generate(blocks, themePresetNames);
  mkdirSync(dirname(OUT_FILE), { recursive: true });
  writeFileSync(OUT_FILE, source);
  // 终步用仓内 biome canonicalize 格式（超长 DOCS 行的折行宽度按 Unicode 显示宽计算，
  // 与 biome formatter 保持一致最可靠的方式就是直接跑 biome format；biome 是确定性格式化器，
  // 不破坏「连跑两次零 diff」）。
  const biome = join(ROOT, "node_modules", ".bin", "biome");
  const formatted = spawnSync(biome, ["format", "--write", relative(ROOT, OUT_FILE)], {
    cwd: ROOT,
    stdio: "pipe",
    encoding: "utf8",
  });
  if (formatted.status !== 0) {
    fail(`biome format failed on ${relative(ROOT, OUT_FILE)}: ${formatted.stderr}`);
  }
  const cells = blocks.filter(
    (block) => block.category === CELLS_CATEGORY && block.meta.name !== NON_RENDERABLE_CELL,
  ).length;
  const archetyped = blocks.filter((block) => block.meta.archetype).length;
  console.log(
    `vocab:generate done — ${blocks.length} block(s), ${cells} cell(s), ` +
      `${themePresetNames.length} theme preset(s), ${archetyped} block(s) with archetype → ${relative(ROOT, OUT_FILE)}`,
  );
  // 词表是 patterns.md/AGENTS.md 词表节的单源：meta 描述变更须连跑 docs:generate（CI Freshness 同序校验）
  console.log("vocab:generate — meta/themes 变更后请连跑 pnpm docs:generate（文档词表节单源注入）");
}

main();
