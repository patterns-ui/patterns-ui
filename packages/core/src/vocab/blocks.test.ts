import { execSync } from "node:child_process";
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ARCHETYPES,
  BLOCK_DOCS,
  BLOCK_NAMES,
  BLOCKS_BY_ARCHETYPE,
  CELL_DOCS,
  CELL_NAMES,
  THEME_PRESET_NAMES,
} from "./blocks.generated";

/**
 * 词表生成物单测（paradigm.md §3.3、M7-A1）：
 *  - (a) 运行时单源：生成物与 fs 实扫 registry meta/themes 派生的集合一致（含 DOCS = meta
 *    description——「JSDoc 与 meta description 一致」的机械化）；
 *  - (b) BLOCKS_BY_ARCHETYPE 与实扫 meta.archetype 一致、引用的 block 全部存在、值域 ∈ 7 原型；
 *  - (c) 编译期封闭：词表外名字必须编译失败（下方 @ts-expect-error；本文件在 core tsconfig 的
 *    include（src）内，`pnpm -r typecheck` → `tsc --noEmit` 覆盖之）；
 *  - (d) 新鲜度：重跑 pnpm vocab:generate 后生成物与提交版本零 diff（CI freshness 的本地前置）。
 */

// (c) 编译期封闭：词表外名字必须编译失败。CellName 为 (typeof CELL_NAMES)[number] 派生联合，
// 报错信息展开全部合法 cell 名（报错信息即目录，paradigm.md §3.3 (2) 的验收形态）。
// @ts-expect-error 词表外名字必须编译失败
const badCellName: CellName = "cell-statuz";
void badCellName;

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const BLOCKS_DIR = join(ROOT, "registry", "blocks");
const THEMES_DIR = join(ROOT, "registry", "themes");
const GENERATED_FILE = join(ROOT, "packages", "core", "src", "vocab", "blocks.generated.ts");
/** cells 命名空间 = registry/blocks/cells/*；cell-for 是映射器工厂，进 BLOCK_NAMES 不进 CELL_NAMES */
const CELLS_CATEGORY = "cells";
const NON_RENDERABLE_CELL = "cell-for";

interface BlockMeta {
  name: string;
  title?: string;
  description?: string;
  archetype?: string;
  /** registry/blocks 下的第一段目录（命名空间） */
  category: string;
}

function scanBlockMetas(): BlockMeta[] {
  const entries = readdirSync(BLOCKS_DIR, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".meta.json"))
    .map((entry) => {
      const metaPath = join(entry.parentPath, entry.name);
      const meta = JSON.parse(readFileSync(metaPath, "utf8")) as Omit<BlockMeta, "category">;
      return {
        ...meta,
        category: relative(BLOCKS_DIR, dirname(metaPath)).split("/")[0] ?? "",
      };
    });
}

function scanThemePresetNames(): string[] {
  return readdirSync(THEMES_DIR)
    .filter((file) => file.endsWith(".json") && !file.endsWith(".meta.json"))
    .map(
      (file) => (JSON.parse(readFileSync(join(THEMES_DIR, file), "utf8")) as { name: string }).name,
    )
    .sort();
}

/** 与生成器同源的描述取值（meta description 优先，回落 title/name） */
function docOf(meta: BlockMeta): string {
  return meta.description ?? meta.title ?? meta.name;
}

const metas = scanBlockMetas();

describe("vocab (a) 运行时单源：生成物 = registry meta/themes 实扫", () => {
  it("CELL_NAMES = registry/blocks/cells/* 全部 block 排除 cell-for（码位序）", () => {
    const expected = metas
      .filter((meta) => meta.category === CELLS_CATEGORY && meta.name !== NON_RENDERABLE_CELL)
      .map((meta) => meta.name)
      .sort();
    expect([...CELL_NAMES]).toEqual(expected);
  });

  it("BLOCK_NAMES = 全部 block 名（含 cell-for，不含 theme；码位序）", () => {
    expect([...BLOCK_NAMES]).toEqual(metas.map((meta) => meta.name).sort());
  });

  it("THEME_PRESET_NAMES = registry/themes/*.json 的 name", () => {
    expect([...THEME_PRESET_NAMES]).toEqual(scanThemePresetNames());
  });

  it("CELL_DOCS / BLOCK_DOCS = meta description（JSDoc 与 meta description 一致）", () => {
    for (const meta of metas) {
      if (meta.category === CELLS_CATEGORY && meta.name !== NON_RENDERABLE_CELL) {
        expect(CELL_DOCS[meta.name as (typeof CELL_NAMES)[number]]).toBe(docOf(meta));
      }
      expect(BLOCK_DOCS[meta.name as (typeof BLOCK_NAMES)[number]]).toBe(docOf(meta));
    }
  });
});

describe("vocab (b) BLOCKS_BY_ARCHETYPE", () => {
  it("键 = 7 原型封闭集（表序），引用的 block 全部存在", () => {
    expect(Object.keys(BLOCKS_BY_ARCHETYPE)).toEqual([...ARCHETYPES]);
    for (const blockNames of Object.values(BLOCKS_BY_ARCHETYPE)) {
      for (const name of blockNames) {
        expect(BLOCK_NAMES).toContain(name);
      }
    }
  });

  it("与实扫 meta.archetype 逐原型一致（overview 现为空：dashboard-page 属 M8）", () => {
    const expected = new Map<string, string[]>(
      ARCHETYPES.map((archetype) => [archetype, [] as string[]]),
    );
    for (const meta of metas) {
      if (meta.archetype !== undefined) {
        expect([...ARCHETYPES]).toContain(meta.archetype);
        expected.get(meta.archetype)?.push(meta.name);
      }
    }
    for (const values of expected.values()) {
      values.sort();
    }
    for (const archetype of ARCHETYPES) {
      expect([...BLOCKS_BY_ARCHETYPE[archetype]]).toEqual(expected.get(archetype) ?? []);
    }
  });
});

describe("vocab (d) 生成器新鲜度", () => {
  it("pnpm vocab:generate 重跑后生成物与提交版本零 diff", { timeout: 60_000 }, () => {
    const committed = readFileSync(GENERATED_FILE, "utf8");
    execSync("pnpm vocab:generate", { cwd: ROOT, stdio: "pipe" });
    const regenerated = readFileSync(GENERATED_FILE, "utf8");
    if (regenerated !== committed) {
      // 失败不留下脏工作区（生成器已覆写文件，先还原再报错）
      writeFileSync(GENERATED_FILE, committed);
      throw new Error(
        `${relative(ROOT, GENERATED_FILE)} is stale — run "pnpm vocab:generate" and commit the result`,
      );
    }
  });
});
