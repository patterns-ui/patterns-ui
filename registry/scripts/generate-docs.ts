/**
 * 文档生成器（M7-C1，docs/paradigm.md §4、§6-C1；§3.4 一等公民原则）。
 *
 * 产出三件（全部生成物提交进 git；CI / ui:check 第 5 步 regen + git diff --exit-code 校验）：
 *  1. AGENTS.md —— 仓根路由层（≤12 行：ui-page skill 加载指引 + 3 铁律，§4.1）；
 *  2. CLAUDE.md → AGENTS.md 相对 symlink —— Claude Code 仅当 CLAUDE.md 不存在时才读
 *     AGENTS.md，symlink 是 agents.md 官方推荐做法；每次 regen 重建（git 存 mode 120000，
 *     目标不变即零 diff）；若已存在同名普通文件则按 paradigm §4.1 注销毁替换为 symlink。
 *  3. docs/patterns.md —— 事实层六节：原型判定表 / 判别式 / 词表目录（含 §3.6 业务模式目录，
 *     M7-C2）/ 每原型 2-3 精选组合 / 反模式。
 *
 * 单源纪律（§3.4，禁止只服务一方的手写副本）：
 *  - 词表节 import core 源注入：vocab/blocks.generated.ts（= registry meta 单源）、
 *    page/actions（ACTION_NAMES/ACTION_DOCS）、list 的 PAGINATION_MODES；theme preset
 *    描述读 registry/themes/*.json（名字来自 THEME_PRESET_NAMES，与 meta 同源）。
 *  - 业务模式目录（§3.6，M7-C2）读源 meta.json 的 pattern 字段 + registry/patterns/*.contract.md
 *    （blocks × metaPatterns × contractVersion × 契约卡摘要[首行 + 内置决策要点]）——零手写副本；
 *    **不读 registry/dist 产物**（顶层 pattern 字段经 shadcn CLI zod parse 会被静默剥离，
 *    validate 通过 ≠ 透传——registry.md §2 剥离坑）。
 *  - 编辑性内容单源在 registry/scripts/docs-data.ts；本生成器对编辑数据做词表交叉校验
 *    （组合 blocks ⊆ BLOCK_NAMES、判定表原型序 = ARCHETYPES、分页协议描述闭集覆盖、
 *    组合每原型 2-3 个）——编辑数据漂出词表即失败，不产出静默漂移的文档。
 *
 * 确定性：固定分节与排序、无时间戳；AGENTS.md 终步过 biome format（markdown 在 biome
 * 检查域内；与 generate-blocks.ts 对生成 TS 的处理同手法——biome 是确定性格式化器，
 * 不破坏「连跑两次零 diff」）。docs/patterns.md 在 biome 排除域（biome.json !docs），
 * 由本生成器的确定性发射器唯一格式化。运行：pnpm docs:generate（tsx）。
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PAGINATION_MODES } from "../../packages/core/src/list/index";
import { META_PATTERN_NAMES } from "../../packages/core/src/meta";
import { ACTION_DOCS, ACTION_NAMES } from "../../packages/core/src/page/actions";
import {
  ARCHETYPES,
  BLOCK_DOCS,
  BLOCK_NAMES,
  BLOCKS_BY_ARCHETYPE,
  CELL_DOCS,
  CELL_NAMES,
  THEME_PRESET_NAMES,
} from "../../packages/core/src/vocab/blocks.generated";
import {
  AGENTS_MD,
  ANTI_PATTERNS,
  ARCHETYPE_TABLE,
  CURATED_COMBOS,
  DISCRIMINATORS,
  PAGINATION_PROTOCOL_DOCS,
} from "./docs-data";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const AGENTS_FILE = join(ROOT, "AGENTS.md");
const CLAUDE_FILE = join(ROOT, "CLAUDE.md");
const PATTERNS_FILE = join(ROOT, "docs", "patterns.md");
const THEMES_DIR = join(ROOT, "registry", "themes");
const BLOCKS_DIR = join(ROOT, "registry", "blocks");
/** AGENTS.md 行数上限（paradigm §4.1「~10 行路由层」的硬边界） */
const AGENTS_MAX_LINES = 12;

interface ThemeDef {
  name: string;
  label?: string;
  description?: string;
}

function fail(message: string): never {
  console.error(`docs:generate — ${message}`);
  process.exit(1);
}

/** markdown 表格单元格安全化：竖线转义 + 折行压平（仅展示层，不改单源数据） */
function mdCell(text: string): string {
  return text.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

/** 名字 + 描述两列表格（blocks / cells / actions / themes 词表节共用形态） */
function vocabTable(entries: readonly { name: string; doc: string }[]): string[] {
  const lines = ["| 名字 | 说明 |", "| --- | --- |"];
  for (const entry of entries) {
    lines.push(`| \`${entry.name}\` | ${mdCell(entry.doc)} |`);
  }
  return lines;
}

// ---------------------------------------------------------------- 编辑数据交叉校验

/** docs-data 编辑内容 vs core 词表：漂出词表即失败（防文档静默漂移） */
function validateDocsData(): void {
  const archetypes = [...ARCHETYPES];
  const tableNames = ARCHETYPE_TABLE.map((row) => row.name);
  if (JSON.stringify(tableNames) !== JSON.stringify(archetypes)) {
    fail(
      `docs-data ARCHETYPE_TABLE 原型序 ${tableNames.join(",")} 与 ARCHETYPES 不一致（须同序全覆盖）`,
    );
  }
  const blockSet = new Set<string>(BLOCK_NAMES);
  const archetypeSet = new Set<string>(archetypes);
  for (const combo of CURATED_COMBOS) {
    if (!archetypeSet.has(combo.archetype)) {
      fail(`docs-data 组合「${combo.title}」原型 "${combo.archetype}" 不在七原型词表`);
    }
    for (const block of combo.blocks) {
      if (!blockSet.has(block)) {
        fail(
          `docs-data 组合「${combo.title}」引用词表外 block "${block}"（组合只能引用 BLOCK_NAMES 内名字）`,
        );
      }
    }
  }
  for (const archetype of archetypes) {
    const count = CURATED_COMBOS.filter((combo) => combo.archetype === archetype).length;
    if (count < 2 || count > 3) {
      fail(
        `docs-data 原型 "${archetype}" 精选组合 ${count} 个（paradigm §6-C1 要求每原型 2-3 个）`,
      );
    }
  }
  for (const mode of PAGINATION_MODES) {
    if (!PAGINATION_PROTOCOL_DOCS[mode]) {
      fail(`docs-data PAGINATION_PROTOCOL_DOCS 缺协议 "${mode}" 描述（新协议须同步补编辑口径）`);
    }
  }
}

// ---------------------------------------------------------------- AGENTS.md + CLAUDE.md symlink

function emitAgentsMd(): string {
  return [
    AGENTS_MD.title,
    "",
    AGENTS_MD.intro,
    "",
    AGENTS_MD.rulesTitle,
    "",
    ...AGENTS_MD.rules,
    "",
    AGENTS_MD.footer,
    "",
  ].join("\n");
}

function writeAgentsMd(): void {
  const source = emitAgentsMd();
  if (!source.includes("ui-page")) {
    fail("AGENTS.md 缺 ui-page skill 加载指引（paradigm §4.1 路由层职责）");
  }
  const lineCount = source.replace(/\n$/, "").split("\n").length;
  if (lineCount > AGENTS_MAX_LINES) {
    fail(`AGENTS.md ${lineCount} 行，超上限 ${AGENTS_MAX_LINES}（路由层保持 ~10 行）`);
  }
  writeFileSync(AGENTS_FILE, source);
  // 终步 biome canonicalize（markdown 在 biome 检查域；确定性格式化器，连跑零 diff）
  const biome = join(ROOT, "node_modules", ".bin", "biome");
  const formatted = spawnSync(biome, ["format", "--write", relative(ROOT, AGENTS_FILE)], {
    cwd: ROOT,
    stdio: "pipe",
    encoding: "utf8",
  });
  if (formatted.status !== 0) {
    fail(`biome format failed on ${relative(ROOT, AGENTS_FILE)}: ${formatted.stderr}`);
  }
}

/** CLAUDE.md → AGENTS.md 相对 symlink：每次 regen 重建（既有普通文件按 §4.1 注销毁替换） */
function ensureClaudeSymlink(): void {
  rmSync(CLAUDE_FILE, { force: true });
  symlinkSync("AGENTS.md", CLAUDE_FILE, "file");
}

// ---------------------------------------------------------------- 词表单源读取

/** theme preset 描述（registry/themes/*.json 的 label/description，与 THEME_PRESET_NAMES 同源校验） */
function collectThemeDocs(): Map<string, string> {
  const files = readdirSync(THEMES_DIR).filter(
    (file) => file.endsWith(".json") && !file.endsWith(".meta.json"),
  );
  const docs = new Map<string, string>();
  for (const file of files) {
    const theme = JSON.parse(readFileSync(join(THEMES_DIR, file), "utf8")) as ThemeDef;
    if (!theme.name) {
      fail(`${relative(ROOT, join(THEMES_DIR, file))}: name is required`);
    }
    docs.set(theme.name, theme.description ?? theme.label ?? theme.name);
  }
  for (const name of THEME_PRESET_NAMES) {
    if (!docs.has(name)) {
      fail(`theme preset "${name}"（THEME_PRESET_NAMES）在 registry/themes/*.json 无对应文件`);
    }
  }
  return docs;
}

// ---------------------------------------------------------------- docs/patterns.md

function emitPatternsMd(themeDocs: Map<string, string>, patterns: PatternEntry[]): string {
  const out: string[] = [
    "# patterns —— 事实层目录（一份契约两种渲染同一来源，paradigm §3.4）",
    "",
    "<!-- Generated by pnpm docs:generate — do not edit. -->",
    "<!-- 编辑性内容单源：registry/scripts/docs-data.ts；词表单源：core 源（vocab/blocks.generated.ts、",
    "     page/actions、list 的 PAGINATION_MODES、meta 的 META_PATTERN_NAMES）+ registry/themes/*.json；",
    "     业务模式目录单源：registry meta.pattern + registry/patterns/*.contract.md。改源后 regen，",
    "     CI freshness 校验零 diff（ci.yml Freshness 步 / ui:check 第 5 步同口径）。 -->",
    "",
    "## 1. 原型判定表（七原型 × 唯一 slot 结构，paradigm §3.2）",
    "",
    "| 原型 | 唯一 slot 结构 | 宿主/变体（prop） | 词表内宿主/预设 | 现状 |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const row of ARCHETYPE_TABLE) {
    const hosts = BLOCKS_BY_ARCHETYPE[row.name];
    const hostCell = hosts.length > 0 ? hosts.map((name) => `\`${name}\``).join(" · ") : "——（M8）";
    out.push(
      `| \`${row.name}\` | ${mdCell(row.slots)} | ${mdCell(row.host)} | ${hostCell} | ${mdCell(row.status)} |`,
    );
  }
  out.push("", DISCRIMINATORS.uniqueSlots, "");

  out.push("## 2. 判别式", "");
  for (const line of DISCRIMINATORS.decisionTree) {
    out.push(`- ${line}`);
  }
  for (const line of DISCRIMINATORS.authVsWizard) {
    out.push(`- ${line}`);
  }
  for (const line of DISCRIMINATORS.crossCutting) {
    out.push(`- ${line}`);
  }
  out.push("");

  out.push(
    "## 3. 词表目录（单源注入，零手写副本）",
    "",
    "全部从 core 源 / registry meta 注入：改 meta 或 core 词表后 `pnpm vocab:generate && pnpm docs:generate`。",
    "写错名字由 typecheck 报错并列出全部合法值（报错信息即目录，paradigm §3.3）。",
    "",
  );

  out.push(
    `### 3.1 blocks（BLOCK_NAMES，${BLOCK_NAMES.length} 个）`,
    "",
    ...vocabTable(BLOCK_NAMES.map((name) => ({ name, doc: BLOCK_DOCS[name] }))),
    "",
    `### 3.2 cells（CELL_NAMES，${CELL_NAMES.length} 个）`,
    "",
    ...vocabTable(CELL_NAMES.map((name) => ({ name, doc: CELL_DOCS[name] }))),
    "",
    "注：`cell-for` 是 type → cell 组件映射器工厂（进 blocks 不进 cells）；列声明走 `meta.cell` 名字。",
    "",
  );

  const themeEntries = THEME_PRESET_NAMES.map((name) => ({
    name,
    doc: themeDocs.get(name) ?? "",
  }));
  out.push(
    `### 3.3 主题 preset（THEME_PRESET_NAMES，${THEME_PRESET_NAMES.length} 个）`,
    "",
    ...vocabTable(themeEntries),
    "",
    "品牌定制唯一入口：只动 `registry/themes/*.css` 的 theme token（ui-theme skill）。",
    "",
  );

  out.push(
    `### 3.4 action（ACTION_NAMES，core/page，${ACTION_NAMES.length} 个）`,
    "",
    ...vocabTable(ACTION_NAMES.map((name) => ({ name, doc: ACTION_DOCS[name] }))),
    "",
    "语义与副作用执行器由宿主注入（core 不绑 router/toast 实现）；词表外名字编译期拒绝、运行期报错列全表。",
    "",
    "### 3.5 分页协议（PAGINATION_MODES，def.list.pagination.mode）",
    "",
    "| 协议 | 语义 | UI 能力派生 | 现状 |",
    "| --- | --- | --- | --- |",
  );
  for (const mode of PAGINATION_MODES) {
    const doc = PAGINATION_PROTOCOL_DOCS[mode];
    out.push(
      `| \`${mode}\` | ${mdCell(doc.semantics)} | ${mdCell(doc.ui)} | ${mdCell(doc.status)} |`,
    );
  }
  out.push(
    "",
    "声明处唯一：适配器 def 的 `list.pagination.mode`（消费端实现）；行为不变量跨协议统一：URL 往返还原、",
    "保存视图、pageSize 钳制、筛选必重置。数据协议与 UI 形态正交（shape 是偏好，能力由协议派生）。",
    "",
  );

  out.push(...emitPatternCatalog(patterns));

  out.push("## 4. 每原型精选组合（2-3 个/原型，取材 demo 18 页真实组合）", "");
  for (const archetype of ARCHETYPES) {
    out.push(`### ${archetype}`, "");
    for (const combo of CURATED_COMBOS.filter((entry) => entry.archetype === archetype)) {
      const blocks = combo.blocks.map((name) => `\`${name}\``).join(" + ");
      const note = combo.note ? ` —— ${combo.note}` : "";
      out.push(`- **${combo.title}** = ${blocks}${note}（取材：${combo.source}）`);
    }
    out.push("");
  }

  out.push(
    "## 5. 反模式（与 eslint 四规则、paradigm §3.5 对齐）",
    "",
    "| 反模式 | 为什么错 | 正解 | 强制层 |",
    "| --- | --- | --- | --- |",
  );
  for (const item of ANTI_PATTERNS) {
    out.push(
      `| ${mdCell(item.pattern)} | ${mdCell(item.why)} | ${mdCell(item.instead)} | ${mdCell(item.enforcedBy)} |`,
    );
  }
  out.push("");
  return out.join("\n");
}

// ---------------------------------------------------------------- 业务模式目录（M7-C2）

/** 业务模式目录条目（数据源 = 源 meta.json 的 pattern 字段 + 契约卡；零手写副本） */
interface PatternEntry {
  /** 模式名 = 契约卡文件名去 .contract.md（如 audit-log / team / notification） */
  name: string;
  /** 组装入口 block（meta.name） */
  entryBlock: string;
  blocks: string[];
  metaPatterns: string[];
  contractVersion: number;
  /** 契约卡首行（blockquote 摘要） */
  summary: string;
  /** 内置决策要点（「### 内置决策」节的加粗引导词） */
  decisions: string[];
}

/** 与 registry/scripts/build.ts 的 CONTRACT_VERSION_RE 同格式约定（契约卡格式两处一致消费） */
const CONTRACT_VERSION_RE = /^- \*\*contractVersion\*\*: (\d+)$/m;

/** 契约卡解析：版本行 + 首行摘要（blockquote）+ 内置决策要点（加粗引导词）；缺任一即失败 */
function parseContractCard(
  cardPath: string,
  relCard: string,
): { contractVersion: number; summary: string; decisions: string[] } {
  const content = readFileSync(cardPath, "utf8");
  const version = content.match(CONTRACT_VERSION_RE);
  if (version === null) {
    fail(`${relCard}: 缺 "- **contractVersion**: <int>" 行（契约卡格式见 registry/patterns/）`);
  }
  const summaryLine = content.split("\n").find((line) => line.startsWith("> "));
  if (summaryLine === undefined) {
    fail(`${relCard}: 缺首行摘要（"> …" blockquote 行）`);
  }
  const decisionSection = content.split(/^### 内置决策$/m)[1]?.split(/^## /m)[0] ?? "";
  const decisions = [...decisionSection.matchAll(/^- \*\*(.+?)\*\*/gm)].map((m) => m[1] ?? "");
  if (decisions.length === 0) {
    fail(`${relCard}: 「### 内置决策」节缺 "- **决策**：…" 条目（决策要点是模式目录的必填面）`);
  }
  return { contractVersion: Number(version[1]), summary: summaryLine.slice(2).trim(), decisions };
}

/**
 * 收集业务模式（读源 meta.json 的 pattern 字段——**不读 dist**：顶层 pattern 字段经 shadcn
 * CLI zod parse 被静默剥离，仓内工具以源为准，registry.md §2 剥离坑）。交叉校验：
 * blocks ⊆ BLOCK_NAMES 且含组装入口自身、metaPatterns ⊆ META_PATTERN_NAMES（core/meta 同源）。
 */
function collectPatterns(): PatternEntry[] {
  const metaFiles = readdirSync(BLOCKS_DIR, { withFileTypes: true, recursive: true })
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((file) => file.endsWith(".meta.json"));
  const patterns: PatternEntry[] = [];
  for (const metaPath of metaFiles.sort()) {
    const meta = JSON.parse(readFileSync(metaPath, "utf8")) as {
      name: string;
      pattern?: { contractCard: string; blocks: string[]; metaPatterns: string[] };
    };
    const raw = meta.pattern;
    if (raw === undefined) continue;
    const relMeta = relative(ROOT, metaPath);
    const cardPath = resolve(ROOT, raw.contractCard);
    const relCard = relative(ROOT, cardPath);
    if (!cardPath.startsWith(ROOT) || !cardPath.endsWith(".contract.md")) {
      fail(
        `${relMeta}: pattern.contractCard "${raw.contractCard}" 须为 registry/patterns/<name>.contract.md`,
      );
    }
    try {
      readFileSync(cardPath, "utf8");
    } catch {
      fail(`${relMeta}: pattern.contractCard "${raw.contractCard}" 不存在`);
    }
    for (const block of raw.blocks) {
      if (!BLOCK_NAMES.includes(block as (typeof BLOCK_NAMES)[number])) {
        fail(
          `${relMeta}: pattern.blocks 引用词表外 block "${block}"（目录只能引用 BLOCK_NAMES 内名字）`,
        );
      }
    }
    if (!raw.blocks.includes(meta.name)) {
      fail(`${relMeta}: pattern.blocks 须含组装入口自身 "${meta.name}"（build.ts 同口径校验）`);
    }
    for (const mp of raw.metaPatterns) {
      if (!(META_PATTERN_NAMES as readonly string[]).includes(mp)) {
        fail(
          `${relMeta}: pattern.metaPatterns "${mp}" 越出元模式封闭词表（合法值：${META_PATTERN_NAMES.join(", ")}）`,
        );
      }
    }
    const card = parseContractCard(cardPath, relCard);
    patterns.push({
      name: basename(cardPath).replace(/\.contract\.md$/, ""),
      entryBlock: meta.name,
      blocks: raw.blocks,
      metaPatterns: raw.metaPatterns,
      ...card,
    });
  }
  patterns.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  return patterns;
}

/** §3.6 业务模式目录：目录表 + 逐模式契约卡摘要（数据单源 meta.pattern + 契约卡） */
function emitPatternCatalog(patterns: PatternEntry[]): string[] {
  if (patterns.length === 0) {
    fail(
      "业务模式目录为空——5 个既有模式（audit-log/team/notification/settings/onboarding）必须声明 meta.pattern",
    );
  }
  const out: string[] = [
    `### 3.6 业务模式目录（meta.pattern 单源，${patterns.length} 模式）`,
    "",
    ...DISCRIMINATORS.decisionTree.flatMap((line) => [`> ${line}`, ""]),
    "| 模式 | 组装入口 | blocks | 元模式 | 契约版本 |",
    "| --- | --- | --- | --- | --- |",
  ];
  for (const p of patterns) {
    out.push(
      `| \`${p.name}\` | \`${p.entryBlock}\` | ${p.blocks.map((b) => `\`${b}\``).join(" · ")} | ${p.metaPatterns.map((m) => `\`${m}\``).join(" · ")} | ${p.contractVersion} |`,
    );
  }
  out.push(
    "",
    "逐模式契约卡摘要（单源 `registry/patterns/<name>.contract.md`；两层契约与决策理由全文在卡——",
    "消费端 `shadcn add <组装入口>` 时契约卡随 files 通道落盘到 block 目录旁）：",
    "",
  );
  for (const p of patterns) {
    out.push(
      `#### ${p.name}（contractVersion ${p.contractVersion}，组装入口 \`${p.entryBlock}\`）`,
      "",
    );
    out.push(`> ${p.summary}`, "");
    out.push(`内置决策：${p.decisions.join(" · ")}`, "");
  }
  return out;
}

// ---------------------------------------------------------------- 收尾防线

/** 生成物不得被 .gitignore 排除（exit 0 = 有路径被忽略 → 失败；多路径不传 --quiet） */
function guardNotGitIgnored(): void {
  const paths = [
    relative(ROOT, AGENTS_FILE),
    relative(ROOT, CLAUDE_FILE),
    relative(ROOT, PATTERNS_FILE),
  ];
  const ignored = spawnSync("git", ["check-ignore", ...paths], {
    cwd: ROOT,
    stdio: "pipe",
    encoding: "utf8",
  });
  if (ignored.status === 0) {
    fail(
      `以下路径被 .gitignore 排除（生成物必须提交进 git，paradigm §4.3）：${(ignored.stdout || "").trim()}`,
    );
  }
  if (ignored.status !== 1 && ignored.status !== null) {
    fail(`git check-ignore 执行失败（exit ${ignored.status}）：${ignored.stderr}`);
  }
}

function main(): void {
  validateDocsData();
  const themeDocs = collectThemeDocs();
  const patterns = collectPatterns();

  writeAgentsMd();
  ensureClaudeSymlink();
  mkdirSync(dirname(PATTERNS_FILE), { recursive: true });
  writeFileSync(PATTERNS_FILE, emitPatternsMd(themeDocs, patterns));

  guardNotGitIgnored();

  const comboCount = CURATED_COMBOS.length;
  console.log(
    `docs:generate done — AGENTS.md + CLAUDE.md symlink + docs/patterns.md ` +
      `（词表：${BLOCK_NAMES.length} blocks / ${CELL_NAMES.length} cells / ${ACTION_NAMES.length} actions / ` +
      `${THEME_PRESET_NAMES.length} themes / ${PAGINATION_MODES.length} 分页协议 / ${META_PATTERN_NAMES.length} 元模式；` +
      `精选组合 ${comboCount}；业务模式 ${patterns.length}）`,
  );
  console.log(
    "docs:generate — 改 registry meta / core 词表后请先 pnpm vocab:generate 再本命令（CI 同序校验新鲜度）",
  );
}

main();
