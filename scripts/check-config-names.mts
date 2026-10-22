/**
 * 三方一致核对：配置名字 ⊆ 注入表 ∪ sandbox 登记表（M7-B4，docs/paradigm.md §6-B4）。
 *
 * 配置化后页面无组件 import 可比（M7-A3），「页面只消费词表名」的纪律改为名字域核对。
 * 三方 = core/vocab 生成物（BLOCK_NAMES/CELL_NAMES）↔ demo 注入子表（pages/tables.ts）
 * ↔ sandbox 登记表（detail spec 的 customTabs/dialogs 运行时登记 + pages 文件头
 * `// sandbox:` 注释登记——B1 豁免通道同款标记）。
 *
 * 实现方案：**结构性提取**——demo 的 tables.ts 与 18 个 *.page.ts 经 tsx 按真实模块加载
 * （demo tsconfig 的 `@/` paths），对导出对象做受检遍历（definePage 产物 / defineResource
 * 产物 / detail spec / 裸列数组），提取已知名字位置的 string；纯文本正则穷举不可靠
 * （配置含大量同形数据串），不采用。已知位置外的词表名由「兜底网」捕获（见 sweepPageConfig）。
 *
 * 核对项（任一红 = 退出码 1，失败输出列全表——报错即目录）：
 *  1. 注入子表键集 = PAGE_BLOCKS_BY_ARCHETYPE[A]（core 单源域，逐原型集合相等；
 *     typecheck 的 BlockTable 映射类型已强制全覆盖，本核对把「词表 ↔ core 域 ↔ demo 注入」
 *     三方串成一条 CI 可见的事实）；
 *  2. definePage 配置的 block 名（host/toolbar/filters/empty/header/timeline/activity/
 *     form/view.name/steps[].block/sections[].content.block）⊆ 对应原型注入域；
 *  3. defineResource/裸列的 meta.cell ⊆ cellFor 标记集（"enum" 为 enum-badge 别名），
 *     且 cell-<marker> ∈ CELL_NAMES（词表第三方）；详情 items[].cell 另含
 *     inline-edit/reference/mono（detail-grid 扩展键，非 cellFor 词表）；
 *  4. tabs[].sandbox / tabs[].block（登记名位）⊆ sandbox 登记表 ∪ BLOCK_NAMES；
 *  5. `// sandbox:` 头登记名必须存在对应注册（customTabs/dialogs 键或 sandbox block）。
 *
 * 用法（root，零安装——tsx 是 root devDep）：
 *   pnpm check:names
 *   （等价：pnpm exec tsx --tsconfig apps/demo/tsconfig.json scripts/check-config-names.mts）
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { PAGE_BLOCKS_BY_ARCHETYPE } from "../packages/core/src/page/blocks.ts";
// core 单源（src 直读，与 eslint-plugin check:slots 同法——不依赖 core dist 先构建）
import {
  ARCHETYPES,
  BLOCK_NAMES,
  type BlockName,
  CELL_NAMES,
} from "../packages/core/src/vocab/blocks.generated.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PAGES_DIR = join(ROOT, "apps/demo/src/pages");
const SANDBOX_BLOCKS_DIR = join(ROOT, "registry/blocks/sandbox");

const BLOCK_NAME_SET = new Set<string>(BLOCK_NAMES as readonly BlockName[]);
const DOMAIN_BY_ARCH = Object.fromEntries(
  ARCHETYPES.map((a) => [a, new Set<string>(PAGE_BLOCKS_BY_ARCHETYPE[a] as readonly string[])]),
);

/**
 * 列 meta.cell 合法标记（registry cells/cell-for CellForType + resource-list-view
 * cellTypeOf 的 "enum" 别名）。第三方核对：cell-<marker> 必须 ∈ CELL_NAMES。
 */
const LIST_CELL_MARKERS = [
  "id",
  "time",
  "status",
  "user",
  "boolean",
  "number",
  "enum", // inferColumns 产出别名 → cell-enum-badge
  "enum-badge",
  "tags",
  "progress",
] as const;
/** 详情键值区扩展键（show/detail-grid DetailGridCellType 独有；非 cellFor 词表域）。 */
const DETAIL_ONLY_CELL_MARKERS = ["inline-edit", "reference", "mono"] as const;
/** settings 预置节构件（core/page/define.ts SettingsSectionPreset 的运行时镜像，M7-A2 冻结）。 */
const SETTINGS_PRESETS = ["org", "profile", "security", "sessions", "appearance"] as const;

const LIST_MARKER_SET = new Set<string>(LIST_CELL_MARKERS);
const DETAIL_MARKER_SET = new Set<string>([...LIST_CELL_MARKERS, ...DETAIL_ONLY_CELL_MARKERS]);
const PRESET_SET = new Set<string>(SETTINGS_PRESETS);
/** 标记 → CELL_NAMES 词表名（词表第三方核对用）。 */
function cellVocabName(marker: string): string | undefined {
  if (!LIST_MARKER_SET.has(marker)) return undefined;
  return `cell-${marker === "enum" ? "enum-badge" : marker}`;
}

// ---------------------------------------------------------------- 输出收集

const errors: string[] = [];
const nameRefs: { file: string; where: string; name: string }[] = [];

function fail(file: string, where: string, message: string): void {
  errors.push(`${file} · ${where}：${message}`);
}
function note(file: string, where: string, name: string): void {
  nameRefs.push({ file, where, name });
}

/** 报错即目录：失败时列全表。 */
function printTables(): void {
  console.log("── 名字域全表（三方）───────────────────────────────");
  console.log("  注入域（PAGE_BLOCKS_BY_ARCHETYPE，tables.ts 键集须与之逐原型相等）：");
  for (const arch of ARCHETYPES) {
    console.log(
      `    ${arch.padEnd(16)}: ${(PAGE_BLOCKS_BY_ARCHETYPE[arch] as readonly string[]).join(", ")}`,
    );
  }
  console.log(`  列 cell 标记（columns[].meta.cell）: ${[...LIST_MARKER_SET].join(", ")}`);
  console.log(
    `  详情 cell 标记（show items[].cell）: ${[...DETAIL_MARKER_SET].join(", ")}（斜体三键为 detail-grid 扩展）`,
  );
  console.log(`  settings 预置节: ${[...PRESET_SET].join(", ")}`);
  console.log(
    `  sandbox 登记表: ${[...sandboxRegistry].sort().join(", ") || "（空——detail spec 的 customTabs/dialogs 键 + 文件头 // sandbox: 登记）"}`,
  );
  console.log("───────────────────────────────────────────────────");
}

// ---------------------------------------------------------------- sandbox 登记表（先收集后核对）

const sandboxRegistry = new Set<string>();
/** 文件头 `// sandbox:` 登记（B1 豁免通道同款标记；结构与运行时双登记位都认）。 */
const headerSandbox = new Map<string, string[]>(); // file → names

function collectHeaderSandbox(file: string, text: string): void {
  // B1 hasSandboxHeader 同语义：只认首语句之前的注释域（JSDoc 块与 // 行注释都认）
  const firstCode = text.search(
    /^(?:import|export|const|let|var|function|type|interface|class|@)\b/m,
  );
  const header = firstCode === -1 ? text : text.slice(0, firstCode);
  const names: string[] = [];
  for (const match of header.matchAll(/(?:\/\/|^\s*\*+)\s*sandbox:\s*([^\s*]+)/gm)) {
    const name = match[1];
    if (name) names.push(name);
  }
  if (names.length > 0) {
    headerSandbox.set(file, names);
    for (const name of names) sandboxRegistry.add(name);
  }
}

// ---------------------------------------------------------------- 受检遍历

type Unknown = Record<string, unknown>;

const isObj = (v: unknown): v is Unknown =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** definePage 产物识别（core/page define.ts：{ archetype, config }）。 */
function isPageConfig(v: unknown): v is { archetype: string; config: Unknown } {
  return isObj(v) && typeof v.archetype === "string" && isObj(v.config);
}

function domainError(arch: string, got: string, position: string): string {
  const domain = (PAGE_BLOCKS_BY_ARCHETYPE[arch] as readonly string[] | undefined) ?? [];
  return `「${got}」不在 ${arch} 注入域（${position}）；合法值：[${domain.join(", ")}]`;
}

function walkPageConfig(
  file: string,
  exportName: string,
  page: { archetype: string; config: Unknown },
): void {
  const { archetype, config } = page;
  const inDomain = new Set<string>(DOMAIN_BY_ARCH[archetype] ?? []);
  const blockSlot = (key: string): void => {
    const v = config[key];
    if (typeof v !== "string") return;
    note(file, `${exportName}.config.${key}`, v);
    if (!inDomain.has(v)) fail(file, `${exportName}.config.${key}`, domainError(archetype, v, key));
  };
  for (const key of [
    "host",
    "toolbar",
    "filters",
    "empty",
    "header",
    "timeline",
    "activity",
    "form",
  ]) {
    blockSlot(key);
  }
  const view = config.view;
  if (isObj(view) && typeof view.name === "string") {
    note(file, `${exportName}.config.view.name`, view.name);
    if (!inDomain.has(view.name))
      fail(file, `${exportName}.config.view.name`, domainError(archetype, view.name, "view"));
  }
  const steps = config.steps;
  if (Array.isArray(steps)) {
    steps.forEach((step, i) => {
      if (!isObj(step) || typeof step.block !== "string") return;
      note(file, `${exportName}.config.steps[${i}].block`, step.block);
      if (!inDomain.has(step.block))
        fail(
          file,
          `${exportName}.config.steps[${i}].block`,
          domainError(archetype, step.block, "steps[].block"),
        );
    });
  }
  const tabs = config.tabs;
  if (Array.isArray(tabs)) walkTabs(file, `${exportName}.config.tabs`, tabs);
  const sections = config.sections;
  if (Array.isArray(sections)) {
    sections.forEach((section, i) => {
      if (!isObj(section) || !isObj(section.content)) return;
      const { content } = section;
      if (typeof content.block === "string") {
        note(file, `${exportName}.config.sections[${i}].content.block`, content.block);
        if (!inDomain.has(content.block))
          fail(
            file,
            `${exportName}.config.sections[${i}].content.block`,
            domainError(archetype, content.block, "sections[].content.block"),
          );
      }
      if (typeof content.preset === "string") {
        note(file, `${exportName}.config.sections[${i}].content.preset`, content.preset);
        if (!PRESET_SET.has(content.preset))
          fail(
            file,
            `${exportName}.config.sections[${i}].content.preset`,
            `「${content.preset}」不是 settings 预置节；合法值：[${SETTINGS_PRESETS.join(", ")}]（core/page define.ts SettingsSectionPreset）`,
          );
      }
    });
  }
  sweepPageConfig(file, exportName, config);
}

/**
 * 兜底网：config 深处的任何 string 若命中 BLOCK_NAMES，必须已被上方已知位置核对
 * （否则 = 词表名出现在新增/未核对位置，登记进本脚本再放行）。防「位置清单过期」漏检。
 */
function sweepPageConfig(file: string, exportName: string, config: Unknown): void {
  const accounted = new Set(
    nameRefs
      .filter((r) => r.file === file && r.where.startsWith(`${exportName}.config`))
      .map((r) => r.name),
  );
  const seen = new Set<string>();
  const walk = (v: unknown, path: string, depth: number): void => {
    if (depth > 8 || typeof v === "function") return;
    if (typeof v === "string") {
      if (BLOCK_NAME_SET.has(v) && !accounted.has(v) && !seen.has(v)) {
        seen.add(v);
        fail(
          file,
          `${exportName}.config${path}`,
          `词表名「${v}」出现在未核对位置——新位置请登记进 scripts/check-config-names.mts 的受检遍历（防位置清单过期）`,
        );
      }
      return;
    }
    if (Array.isArray(v)) {
      v.forEach((item, i) => {
        walk(item, `${path}[${i}]`, depth + 1);
      });
      return;
    }
    if (isObj(v)) for (const [k, val] of Object.entries(v)) walk(val, `${path}.${k}`, depth + 1);
  };
  walk(config, "", 0);
}

/** tabs 数组（definePage resource-detail 与 def.show 共用登记位语义）。 */
function walkTabs(file: string, where: string, tabs: unknown[]): void {
  tabs.forEach((tab, i) => {
    if (!isObj(tab)) return;
    if (typeof tab.block === "string") {
      note(file, `${where}[${i}].block`, tab.block);
      if (!BLOCK_NAME_SET.has(tab.block) && !sandboxRegistry.has(tab.block)) {
        fail(
          file,
          `${where}[${i}].block`,
          `「${tab.block}」既不在 BLOCK_NAMES 也不在 sandbox 登记表：[${[...sandboxRegistry].sort().join(", ") || "空"}]`,
        );
      }
    }
    if (typeof tab.sandbox === "string") {
      note(file, `${where}[${i}].sandbox`, tab.sandbox);
      if (!sandboxRegistry.has(tab.sandbox)) {
        fail(
          file,
          `${where}[${i}].sandbox`,
          `「${tab.sandbox}」未在 sandbox 登记表注册（detail spec customTabs/dialogs 键或文件头 // sandbox: 登记）；现登记表：[${[...sandboxRegistry].sort().join(", ") || "空"}]`,
        );
      }
    }
  });
}

/** defineResource 产物 / spec.def / 裸列数组 的名字遍历。 */
function walkResourceDef(file: string, where: string, def: Unknown): void {
  const columns = def.columns;
  if (Array.isArray(columns)) walkColumns(file, `${where}.columns`, columns);
  const show = def.show;
  if (isObj(show)) {
    const sections = show.sections;
    if (Array.isArray(sections)) {
      sections.forEach((section, s) => {
        if (!isObj(section) || !Array.isArray(section.items)) return;
        section.items.forEach((item: unknown, i: number) => {
          if (!isObj(item) || typeof item.cell !== "string") return;
          note(file, `${where}.show.sections[${s}].items[${i}].cell`, item.cell);
          if (!DETAIL_MARKER_SET.has(item.cell)) {
            fail(
              file,
              `${where}.show.sections[${s}].items[${i}].cell`,
              `「${item.cell}」不在详情 cell 标记集；合法值：[${[...DETAIL_MARKER_SET].join(", ")}]（cellFor 家族 + detail-grid 扩展）`,
            );
          }
        });
      });
    }
    if (Array.isArray(show.tabs)) walkTabs(file, `${where}.show.tabs`, show.tabs);
  }
}

function walkColumns(file: string, where: string, columns: unknown[]): void {
  columns.forEach((col, i) => {
    if (!isObj(col) || !isObj(col.meta) || typeof col.meta.cell !== "string") return;
    const marker = col.meta.cell as string;
    note(file, `${where}[${i}].meta.cell`, marker);
    if (!LIST_MARKER_SET.has(marker)) {
      fail(
        file,
        `${where}[${i}].meta.cell`,
        `「${marker}」不在列 cell 标记集；合法值：[${[...LIST_MARKER_SET].join(", ")}]（cellFor 家族，"enum" 为 enum-badge 别名）`,
      );
      return;
    }
    const vocab = cellVocabName(marker);
    if (vocab !== undefined && !new Set<string>(CELL_NAMES as readonly string[]).has(vocab)) {
      fail(
        file,
        `${where}[${i}].meta.cell`,
        `标记「${marker}」→ 词表名「${vocab}」不在 CELL_NAMES（生成物过期？）`,
      );
    }
  });
}

// ---------------------------------------------------------------- tables.ts 注入子表核对

function walkTablesModule(file: string, mod: Record<string, unknown>): number {
  let tableCount = 0;
  for (const [exportName, value] of Object.entries(mod)) {
    if (!isObj(value)) continue;
    const entries = Object.entries(value);
    if (entries.length === 0 || !entries.every(([, v]) => typeof v === "function")) continue;
    tableCount += 1;
    const keys = new Set(entries.map(([k]) => k));
    const matched = ARCHETYPES.filter((arch) => {
      const domain = DOMAIN_BY_ARCH[arch];
      return (
        domain !== undefined && domain.size === keys.size && [...keys].every((k) => domain.has(k))
      );
    });
    if (matched.length === 1) continue;
    if (matched.length === 0) {
      fail(
        file,
        exportName,
        `注入子表键集 [${[...keys].join(", ")}] 不与任何原型的注入域集合相等（BlockTable<A> 要求全覆盖）；各原型合法域见下方全表`,
      );
    } else {
      fail(
        file,
        exportName,
        `注入子表键集同时匹配多个原型（${matched.join(" / ")}）——域表歧义，请核对 core PAGE_BLOCKS_BY_ARCHETYPE`,
      );
    }
  }
  return tableCount;
}

// ---------------------------------------------------------------- main

async function main(): Promise<number> {
  const pageFiles = readdirSync(PAGES_DIR)
    .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
    .sort();

  // 词表第三方：注入域 ⊆ BLOCK_NAMES（core satisfies 已保证；运行时复核防生成物漂移）
  for (const arch of ARCHETYPES) {
    for (const name of PAGE_BLOCKS_BY_ARCHETYPE[arch] as readonly string[]) {
      if (!BLOCK_NAME_SET.has(name))
        fail(
          "core/vocab",
          `PAGE_BLOCKS_BY_ARCHETYPE.${arch}`,
          `「${name}」不在 BLOCK_NAMES（悬空名）`,
        );
    }
  }

  // 第一遍：文件头 sandbox 登记（文本）+ 模块加载
  const modules = new Map<string, Record<string, unknown>>();
  for (const f of pageFiles) {
    const path = join(PAGES_DIR, f);
    const text = readFileSync(path, "utf8");
    collectHeaderSandbox(f, text);
    try {
      const mod = (await import(pathToFileURL(path).href)) as Record<string, unknown>;
      modules.set(f, mod);
    } catch (error) {
      fail(
        f,
        "module",
        `模块加载失败（${error instanceof Error ? error.message : String(error)}）`,
      );
    }
  }

  // 第二遍：运行时登记表（detail spec customTabs/dialogs）先入 sandboxRegistry
  for (const [f, mod] of modules) {
    for (const [exportName, value] of Object.entries(mod)) {
      if (!isObj(value)) continue;
      for (const regKey of ["customTabs", "dialogs"] as const) {
        const reg = value[regKey];
        if (!isObj(reg)) continue;
        for (const key of Object.keys(reg)) {
          sandboxRegistry.add(key);
          note(f, `${exportName}.${regKey}["${key}"]`, key);
        }
      }
    }
  }

  // 第三遍：逐导出受检遍历
  let pageConfigCount = 0;
  let defCount = 0;
  let tableCount = 0;
  for (const [f, mod] of modules) {
    if (f === "tables.ts") {
      tableCount = walkTablesModule(f, mod);
      continue;
    }
    for (const [exportName, value] of Object.entries(mod)) {
      if (isPageConfig(value)) {
        pageConfigCount += 1;
        if (!new Set(ARCHETYPES as readonly string[]).has(value.archetype)) {
          fail(f, exportName, `未知原型「${value.archetype}」；合法值：[${ARCHETYPES.join(", ")}]`);
          continue;
        }
        walkPageConfig(f, exportName, value);
      }
      if (isObj(value) && isObj(value.def)) {
        defCount += 1;
        walkResourceDef(f, `${exportName}.def`, value.def);
      } else if (isObj(value) && Array.isArray(value.columns) && typeof value.name === "string") {
        defCount += 1;
        walkResourceDef(f, exportName, value);
      } else if (
        Array.isArray(value) &&
        value.some((c) => isObj(c) && isObj((c as Unknown).meta))
      ) {
        walkColumns(f, exportName, value);
      }
    }
  }

  // 头登记的对应注册存在性（customTabs/dialogs 键或 registry/blocks/sandbox/<name>/）
  for (const [f, names] of headerSandbox) {
    for (const name of names) {
      const hasRuntimeReg = modules.some((mod) =>
        Object.values(mod).some(
          (v) =>
            isObj(v) &&
            ["customTabs", "dialogs"].some(
              (regKey) => isObj(v[regKey]) && name in (v[regKey] as Unknown),
            ),
        ),
      );
      const hasSandboxBlock =
        existsSync(join(SANDBOX_BLOCKS_DIR, name)) &&
        statSync(join(SANDBOX_BLOCKS_DIR, name)).isDirectory();
      if (!hasRuntimeReg && !hasSandboxBlock) {
        fail(
          f,
          "sandbox 头登记",
          `「${name}」无对应注册（detail spec customTabs/dialogs 键或 registry/blocks/sandbox/${name}/）`,
        );
      }
    }
  }

  // 汇总
  if (errors.length > 0) {
    printTables();
    console.error(`✗ 三方一致核对失败（${errors.length} 处越域/断裂）：`);
    for (const error of errors) console.error(`  - ${error}`);
    return 1;
  }
  const headerCount = [...headerSandbox.values()].reduce((n, names) => n + names.length, 0);
  console.log(
    `✓ 三方一致核对：${pageFiles.length} 个 pages 模块（definePage ${pageConfigCount} · def/列集 ${defCount} · 名字引用 ${nameRefs.length} 处）· 注入子表 ${tableCount} 张全等于 core 域 · sandbox 登记 ${sandboxRegistry.size} 名（头登记 ${headerCount}）。`,
  );
  return 0;
}

process.exit(await main());
