/**
 * registry 构建脚本（docs/registry.md §3）。
 *
 * 行为：
 *  1. 扫描 registry/blocks 下所有 <name>.meta.json（registry/themes 的 theme item 支持在 M1 接入）。
 *  2. 内联 block 目录内 .ts/.tsx/.css 源文件为 files[].content，target 由 meta.targetDir 决定。
 *  3. 解析源码 import：block 间依赖 → registryDependencies（GitHub 完整引用 patterns-ui/patterns-ui/<name>）；
 *     @/components/ui/<name> → 钉扎为官方 Base UI 方言完整 URL（OFFICIAL_BASE_REGISTRY）；
 *     @patterns-ui/core → npm dependencies（版本读 packages/core/package.json）；
 *     其余裸 npm 包并入 dependencies（react 系除外）。
 *  4. 校验：registryDependencies 引用的 block 存在、无循环依赖、无相对路径逃逸出 block 目录、
 *     不得 import demo 代码（architecture.md §5 之外的 `@/*` 形态一律拒绝）、
 *     不得 barrel import `@/components/ui`（无法解析出具体官方组件名）、
 *     meta.archetype（可选）∈ 7 页面原型（docs/paradigm.md §3.2）并透传到 item 顶层；
 *     meta.pattern（可选，M7-C2）—— blocks ⊆ 全部 block 名且含组装入口自身、
 *     metaPatterns ∈ 元模式封闭词表、contractCard 文件存在且含 contractVersion 行。
 *  5. 输出 registry/dist/r/<name>.json（shadcn registry-item schema）与仓库根 registry.json
 *     （GitHub repo-as-registry 索引，items 内联，提交进仓库）。另产两类非 block item：
 *     theme（registry:theme，自含 css）与 skills 通道一 item（registry:file，M7-D——三份
 *     SKILL.md（.zcode/skills 单源）+ 渲染脚本，~ target staging 到 .patterns-ui/skills/）。
 *
 * 运行：pnpm registry:build（tsx）。validate 由 `pnpm dlx shadcn@latest registry validate` 单独执行（CI 亦跑）。
 *
 * **pattern 字段的 CLI 剥离坑（M7-C2，paradigm §1.3/M7-C2 已核实）**：顶层 `pattern` 字段经
 * shadcn CLI zod parse 会被**静默剥离**——`registry validate` 通过 ≠ 透传给消费端。仓内工具
 * （docs 生成器、决策树）一律读源 meta.json 不读 dist 产物；契约卡本体经 files 通道
 * （type registry:file）分发不受剥离影响（消费端 `shadcn add` 得到 .md 落盘）。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const BLOCKS_DIR = join(ROOT, "registry", "blocks");
const THEMES_DIR = join(ROOT, "registry", "themes");
const SKILLS_DEF_DIR = join(ROOT, "registry", "skills");
const DIST_DIR = join(ROOT, "registry", "dist", "r");
const CORE_PACKAGE_JSON = join(ROOT, "packages", "core", "package.json");

/**
 * 官方 shadcn registry 的 Base UI 方言钉扎点（"registry:base"）。
 * 裸名 registryDependencies 永远解析到官方 shadcn 默认 registry，其方言随消费端
 * components.json 的 style 漂移（new-york=Radix、base-nova=Base UI……）。本仓 blocks
 * 基于 Base UI 方言，故所有官方裸名一律改写为该前缀下的完整 URL，钉死方言。
 */
const OFFICIAL_BASE_REGISTRY = "https://ui.shadcn.com/r/styles/base-nova";
/** 自家 item 的 GitHub 完整引用前缀（registry.md §4 主通道；裸名会误解析到官方 shadcn，绝不输出） */
const GITHUB_REGISTRY_REF = "patterns-ui/patterns-ui";

const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".css"]);
const BLOCK_ITEM_TYPES = new Set(["registry:component", "registry:block"]);
/** 页面原型封闭集（docs/paradigm.md §3.2；与 registry/scripts/generate-blocks.ts 的 ARCHETYPES 同源） */
const ARCHETYPES = new Set([
  "resource-list",
  "resource-detail",
  "resource-form",
  "settings",
  "overview",
  "auth-flow",
  "wizard",
]);
/** npm 依赖白名单外的运行库：宿主项目自带（React 系），不进 item.dependencies。TanStack 框架层照常声明 */
const IMPLICIT_NPM_IMPORTS = new Set(["react", "react-dom", "react/jsx-runtime"]);
const CORE_PACKAGE = "@patterns-ui/core";

/**
 * 元模式封闭词表（M7-C2）——**与 packages/core/src/meta/index.ts 的 META_PATTERN_NAMES
 * 同源硬编码两处**（docs/paradigm.md §1.2「元模式清单」16 值，表序即此序）。改清单属
 * ①象限变更纪律：paradigm §1.2 表、core 词表、本处三地同步改。
 */
const META_PATTERNS = new Set([
  "resource-lifecycle",
  "list-browse",
  "reference-resolution",
  "multi-tenant",
  "auth-rbac",
  "task-polling",
  "new-items-signal",
  "flow",
  "audit-trail",
  "read-state",
  "billing-lifecycle",
  "api-key-lifecycle",
  "import-pipeline",
  "comment-thread",
  "webhook-delivery",
  "permission-matrix",
]);

/** 契约卡正文的 contractVersion 行（生成器 docs:generate 同款解析——两处同格式约定） */
const CONTRACT_VERSION_RE = /^- \*\*contractVersion\*\*: (\d+)$/m;

/** 业务模式附加字段（M7-C2，paradigm §1.3）：声明该 item 是某业务模式的组装入口 */
interface BlockPattern {
  /** 契约卡仓内单源文件（仓库根相对路径；build 并入 item files、docs 生成器读摘要） */
  contractCard: string;
  /** 该模式组合的 block（组装入口自身必含） */
  blocks: string[];
  /** 基于的元模式（封闭词表 META_PATTERNS） */
  metaPatterns: string[];
}

/** 官方 base-nova item 完整 URL */
function officialBaseItemUrl(name: string): string {
  return `${OFFICIAL_BASE_REGISTRY}/${name}.json`;
}

interface BlockMeta {
  name: string;
  type: string;
  title?: string;
  description?: string;
  categories?: string[];
  /** 页面原型（7 合法值，见 ARCHETYPES）；仅原型的宿主/预设 block 声明，透传到 registry item 顶层 */
  archetype?: string;
  /** 业务模式组装入口声明（M7-C2；见 BlockPattern） */
  pattern?: BlockPattern;
  dependencies?: string[];
  registryDependencies?: string[];
  targetDir: string;
}

interface RegistryFile {
  path: string;
  type: string;
  target: string;
  content: string;
}

interface RegistryItem {
  $schema: string;
  name: string;
  type: string;
  title?: string;
  description?: string;
  archetype?: string;
  /** 业务模式组装入口（M7-C2；CLI zod parse 会剥离顶层 pattern——仓内工具读源 meta，见文件头注） */
  pattern?: BlockPattern & { contractVersion: number };
  cssVars?: { light: Record<string, string>; dark: Record<string, string> };
  files: RegistryFile[];
  dependencies: string[];
  registryDependencies: string[];
}

/** registry/themes/<preset>.json 的源格式（docs/blocks.md themes/ 一节） */
interface ThemeDef {
  name: string;
  label: string;
  description?: string;
  cssVars: { light: Record<string, string>; dark: Record<string, string> };
}

/** registry/skills/skills.json 的源格式（M7-D 通道一，docs/registry.md §4） */
interface SkillsDef {
  name: string;
  type: string;
  title?: string;
  description?: string;
  /** 消费端 staging 目录（~ 前缀 = 项目根，shadcn target 语义） */
  stagingTarget: string;
  /** 三份 SKILL.md 的仓内单源（.zcode/skills/<name>/SKILL.md——build 读取打包，仓内不复制第二份源） */
  skills: { name: string; source: string }[];
  /** 内嵌渲染脚本（staging 落盘后按项目形态渲染到宿主 skills 目录） */
  renderScript: string;
}

/**
 * 主题 preset → CSS：`:root[data-preset]` / `:root[data-preset][data-theme="dark"]`。
 * 用 :root 前缀抬升优先级，保证压过宿主 styles.css 里的 `:root` 与 `[data-theme="dark"]`
 * 基线令牌（同为 0,1,0 特异度时后出现的样式才能覆盖，加 :root 后不依赖书写顺序）。
 *
 * 末尾追加 `@theme inline` 段：全部令牌 → Tailwind v4 语义 utility 名（--color-* 一对一映射
 * + radius 派生四档，口径与 apps/demo/src/styles.css 的 @theme inline 一致）。每个 preset
 * 文件自含完整映射——消费端只需 add 一个 theme item 即可用全部语义色/radius utility。
 */
function buildThemeCss(theme: ThemeDef): string {
  const block = (vars: Record<string, string>): string =>
    Object.entries(vars)
      .map(([key, value]) => `  ${key}: ${value};`)
      .join("\n");
  // 令牌全集（light 顺序在前；--radius 本身不进 color 映射，由派生组接手）
  const tokenNames = [...Object.keys(theme.cssVars.light), ...Object.keys(theme.cssVars.dark)]
    .map((key) => key.replace(/^--/, ""))
    .filter((name, index, all) => name !== "radius" && all.indexOf(name) === index);
  const themeInline = [
    "/* 语义令牌 → Tailwind v4 utility 名（消费端无需再写 @theme；inline = utility 直接引用 var(--token)） */",
    "@theme inline {",
    ...tokenNames.map((name) => `  --color-${name}: var(--${name});`),
    "",
    "  --radius-sm: calc(var(--radius) - 4px);",
    "  --radius-md: calc(var(--radius) - 2px);",
    "  --radius-lg: var(--radius);",
    "  --radius-xl: calc(var(--radius) + 4px);",
    "}",
    "",
  ];
  return [
    `/* Generated by registry:build — preset "${theme.name}" (${theme.label}). Do not edit. */`,
    `:root[data-preset="${theme.name}"] {`,
    block(theme.cssVars.light),
    "}",
    "",
    `:root[data-preset="${theme.name}"][data-theme="dark"] {`,
    block(theme.cssVars.dark),
    "}",
    "",
    ...themeInline,
  ].join("\n");
}

function buildThemeItems(): RegistryItem[] {
  if (!existsSync(THEMES_DIR)) {
    return [];
  }
  const themeFiles = readdirSync(THEMES_DIR).filter(
    (file) => file.endsWith(".json") && !file.endsWith(".meta.json"),
  );
  const items: RegistryItem[] = [];
  for (const file of themeFiles.sort()) {
    const theme = JSON.parse(readFileSync(join(THEMES_DIR, file), "utf8")) as ThemeDef;
    if (!theme.name || !theme.label || !theme.cssVars?.light || !theme.cssVars?.dark) {
      fail(
        `${relative(ROOT, join(THEMES_DIR, file))}: name/label/cssVars.{light,dark} are required`,
      );
    }
    const css = buildThemeCss(theme);
    // 生成 CSS 落盘到 registry/themes/<name>.css（提交进仓库；demo 与用户项目直接 @import）
    writeFileSync(join(THEMES_DIR, `${theme.name}.css`), css);
    // 刻意不携带 cssVars：CLI 对 registry:theme 的 cssVars 物化会向消费端 index.css 追加
    // 自生成的 @theme inline，其 var 引用双写前导横线（var(----x)，shadcn@4.21/4.22 实测），
    // 且 :root/.dark 平铺与我们的 data-preset 多 preset 切换语义冲突——theme 的唯一交付面
    // 是下面这个自含 css 文件（vars + @theme inline），消费端 @import 即得全部 utility。
    items.push({
      $schema: "https://ui.shadcn.com/schema/registry-item.json",
      name: `theme-${theme.name}`,
      type: "registry:theme",
      title: `${theme.label} Theme`,
      ...(theme.description ? { description: theme.description } : {}),
      files: [
        {
          path: relative(ROOT, join(THEMES_DIR, `${theme.name}.css`)),
          type: "registry:theme",
          target: `theme/${theme.name}.css`,
          content: css,
        },
      ],
      dependencies: [],
      registryDependencies: [],
    });
    console.log(`  theme ${theme.name} → dist/r/theme-${theme.name}.json (+ ${theme.name}.css)`);
  }
  return items;
}

/**
 * skills 通道一 item（M7-D，paradigm §4.3）：type `registry:file`，files 携带三份 SKILL.md
 * （源 = .zcode/skills/ 单源，build 读取内联——仓内不复制第二份源）+ 内嵌渲染脚本
 * （registry/skills/render-skills.mjs 单源）。target 全部 `~/` 前缀（= 消费端项目根，shadcn
 * registry target 语义，官方 docs "Use ~ to refer to the root of the project"）：staging 落
 * `<project>/.patterns-ui/skills/`，消费端手动运行渲染脚本分发到 .claude/.zcode/.agents 三宿主
 * 目录并按项目形态微调——「按消费项目生成变体」的最小自实现（通道二 skills.sh 是静态源，见
 * README「AI / skills」节）。item 无依赖（registryDependencies 为空——**禁裸名**约束 vacuous 满足：
 * 引用自家一律完整 URL，此处无引用）。
 */
function buildSkillsItem(): RegistryItem[] {
  const defPath = join(SKILLS_DEF_DIR, "skills.json");
  if (!existsSync(defPath)) {
    return [];
  }
  const def = JSON.parse(readFileSync(defPath, "utf8")) as SkillsDef;
  if (!def.name || !def.type || !def.stagingTarget || !def.renderScript) {
    fail(`${relative(ROOT, defPath)}: name/type/stagingTarget/renderScript are required`);
  }
  if (def.type !== "registry:file" && def.type !== "registry:item") {
    fail(
      `${relative(ROOT, defPath)}: type must be "registry:file" (channel-1 skills) or "registry:item" — ` +
        "自定义 type 值会被 shadcn registry validate 拒（docs/registry.md §2）",
    );
  }
  if (!Array.isArray(def.skills) || def.skills.length === 0) {
    fail(`${relative(ROOT, defPath)}: skills 须为非空数组`);
  }
  const seen = new Set<string>();
  const files: RegistryFile[] = [];
  for (const skill of def.skills) {
    if (!skill?.name || !skill?.source) {
      fail(`${relative(ROOT, defPath)}: skills[] 每项须含 name 与 source`);
    }
    if (seen.has(skill.name)) {
      fail(`${relative(ROOT, defPath)}: skills[] 重名 "${skill.name}"`);
    }
    seen.add(skill.name);
    const sourcePath = resolve(ROOT, skill.source);
    if (
      !sourcePath.startsWith(ROOT) ||
      !existsSync(sourcePath) ||
      !sourcePath.endsWith("SKILL.md")
    ) {
      fail(
        `${relative(ROOT, defPath)}: skills[].source "${skill.source}" 不存在（须为仓内 SKILL.md，` +
          "单源 = .zcode/skills/<name>/SKILL.md）",
      );
    }
    files.push({
      path: relative(ROOT, sourcePath),
      type: "registry:file",
      target: `${def.stagingTarget}/${skill.name}/SKILL.md`,
      content: readFileSync(sourcePath, "utf8"),
    });
  }
  const scriptPath = resolve(ROOT, def.renderScript);
  if (!scriptPath.startsWith(ROOT) || !existsSync(scriptPath)) {
    fail(`${relative(ROOT, defPath)}: renderScript "${def.renderScript}" 不存在`);
  }
  files.push({
    path: relative(ROOT, scriptPath),
    type: "registry:file",
    target: `${def.stagingTarget}/${basename(scriptPath)}`,
    content: readFileSync(scriptPath, "utf8"),
  });
  console.log(
    `  skills ${def.name} → dist/r/${def.name}.json (${files.length} files: ${def.skills.length} SKILL.md + render script, staging ${def.stagingTarget})`,
  );
  return [
    {
      $schema: "https://ui.shadcn.com/schema/registry-item.json",
      name: def.name,
      type: def.type,
      ...(def.title ? { title: def.title } : {}),
      ...(def.description ? { description: def.description } : {}),
      files,
      dependencies: [],
      registryDependencies: [],
    },
  ];
}

/** 收集 block 源码里的静态 import / export-from / 动态 import 说明符 */
function collectImports(source: string): string[] {
  const specifiers = new Set<string>();
  const patterns = [
    /(?:import|export)\s[^;'"]*?from\s*['"]([^'"]+)['"]/g,
    /import\s*['"]([^'"]+)['"]/g,
    /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1];
      if (specifier) specifiers.add(specifier);
    }
  }
  return [...specifiers];
}

function fileTypeFor(extension: string): string {
  if (extension === ".tsx") return "registry:component";
  if (extension === ".ts") return "registry:lib";
  return "registry:theme";
}

function listFilesRecursive(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true, recursive: true });
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name));
}

function findMetaFiles(): string[] {
  return listFilesRecursive(BLOCKS_DIR).filter((file) => file.endsWith(".meta.json"));
}

function fail(message: string): never {
  console.error(`registry:build — ${message}`);
  process.exit(1);
}

function depName(dep: string): string {
  return dep.split("@")[0] || dep;
}

/**
 * pattern 字段校验与解析（M7-C2，docs/registry.md §2）：
 *  - blocks ⊆ 全部 block 名，且组装入口自身（meta.name）必含；
 *  - metaPatterns ⊆ 元模式封闭词表（META_PATTERNS，与 core/meta 同源）且非空；
 *  - contractCard（仓库根相对路径）存在，正文含 `- **contractVersion**: <int>` 行（版本单源在卡）。
 * 返回并入 item 的 pattern 对象与契约卡绝对路径（files 通道分发用）。
 */
function validatePattern(
  meta: BlockMeta,
  metaPath: string,
  blockNames: Set<string>,
): { pattern: BlockPattern & { contractVersion: number }; cardPath: string } | undefined {
  const raw = meta.pattern;
  if (raw === undefined) return undefined;
  const rel = relative(ROOT, metaPath);
  if (
    !Array.isArray(raw.blocks) ||
    raw.blocks.length === 0 ||
    !raw.blocks.every((block) => typeof block === "string")
  ) {
    fail(`${rel}: pattern.blocks 须为非空 block 名数组`);
  }
  if (!raw.blocks.includes(meta.name)) {
    fail(`${rel}: pattern.blocks 须含组装入口自身 "${meta.name}"`);
  }
  const unknownBlocks = raw.blocks.filter((block) => !blockNames.has(block));
  if (unknownBlocks.length > 0) {
    fail(`${rel}: pattern.blocks 引用未知 block：${unknownBlocks.join(", ")}`);
  }
  if (
    !Array.isArray(raw.metaPatterns) ||
    raw.metaPatterns.length === 0 ||
    !raw.metaPatterns.every((mp) => typeof mp === "string")
  ) {
    fail(`${rel}: pattern.metaPatterns 须为非空元模式名数组`);
  }
  const unknownPatterns = raw.metaPatterns.filter((mp) => !META_PATTERNS.has(mp));
  if (unknownPatterns.length > 0) {
    fail(
      `${rel}: pattern.metaPatterns 越出元模式封闭词表：${unknownPatterns.join(", ")}（合法值：${[
        ...META_PATTERNS,
      ].join(", ")}——与 core/meta META_PATTERN_NAMES 同源，paradigm §1.2）`,
    );
  }
  if (typeof raw.contractCard !== "string" || raw.contractCard === "") {
    fail(`${rel}: pattern.contractCard 须为契约卡路径（仓库根相对）`);
  }
  const cardPath = resolve(ROOT, raw.contractCard);
  if (!cardPath.startsWith(ROOT) || !existsSync(cardPath) || !cardPath.endsWith(".contract.md")) {
    fail(
      `${rel}: pattern.contractCard "${raw.contractCard}" 不存在（须为 registry/patterns/<name>.contract.md）`,
    );
  }
  const cardContent = readFileSync(cardPath, "utf8");
  const versionMatch = cardContent.match(CONTRACT_VERSION_RE);
  if (versionMatch === null) {
    fail(
      `${relative(ROOT, cardPath)}: 缺 "- **contractVersion**: <int>" 行（契约卡格式见 registry/patterns/）`,
    );
  }
  return {
    pattern: { ...raw, contractVersion: Number(versionMatch[1]) },
    cardPath,
  };
}

async function main(): Promise<void> {
  const coreVersion = JSON.parse(readFileSync(CORE_PACKAGE_JSON, "utf8")).version as string;
  const metaFiles = findMetaFiles();
  if (metaFiles.length === 0) {
    fail("no *.meta.json found under registry/blocks");
  }

  const metas = new Map<string, { meta: BlockMeta; metaPath: string }>();
  for (const metaPath of metaFiles) {
    const meta = JSON.parse(readFileSync(metaPath, "utf8")) as BlockMeta;
    if (!meta.name || !meta.type || !meta.targetDir) {
      fail(`${relative(ROOT, metaPath)}: name/type/targetDir are required`);
    }
    if (!BLOCK_ITEM_TYPES.has(meta.type)) {
      fail(`${relative(ROOT, metaPath)}: type must be one of ${[...BLOCK_ITEM_TYPES].join(", ")}`);
    }
    if (meta.archetype !== undefined && !ARCHETYPES.has(meta.archetype)) {
      fail(
        `${relative(ROOT, metaPath)}: archetype "${meta.archetype}" must be one of ${[...ARCHETYPES].join(", ")}`,
      );
    }
    const key = relative(BLOCKS_DIR, dirname(metaPath));
    if (metas.has(key)) {
      fail(`duplicate block directory key: ${key}`);
    }
    metas.set(key, { meta, metaPath });
  }
  const blockNames = new Set([...metas.values()].map(({ meta }) => meta.name));

  /** pattern 字段校验（M7-C2）——结果按 block 名索引，item 构建时透传 + 契约卡并入 files */
  const patternInfo = new Map<
    string,
    { pattern: BlockPattern & { contractVersion: number }; cardPath: string }
  >();
  for (const { meta, metaPath } of metas.values()) {
    const info = validatePattern(meta, metaPath, blockNames);
    if (info) patternInfo.set(meta.name, info);
  }

  /** block 依赖图（用于存在性校验 + 环检测） */
  const graph = new Map<string, Set<string>>();
  const blockItems: RegistryItem[] = [];

  for (const [key, { meta, metaPath }] of metas) {
    const blockDir = dirname(metaPath);
    const sourceFiles = listFilesRecursive(blockDir)
      .filter(
        (file) =>
          SOURCE_EXTENSIONS.has(file.slice(file.lastIndexOf("."))) &&
          !file.endsWith(".meta.json") &&
          !file.endsWith(".d.ts"),
      )
      .sort();

    if (sourceFiles.length === 0) {
      fail(`${relative(ROOT, metaPath)}: block has no inlineable source files`);
    }

    const dependencies = new Set<string>(meta.dependencies ?? []);
    const registryDependencies = new Set<string>();
    /** 图边（内部用裸 block 名；输出用的 registryDependencies 一律完整引用） */
    const blockDeps = new Set<string>();

    // meta 里声明的 registryDependencies：命中我方 block 名的裸名 → GitHub 完整引用；
    // 其余裸名 → 官方 Base UI 方言完整 URL（钉方言）；已含 "/" 的完整引用（URL / owner/repo / @ns）原样保留
    for (const dep of meta.registryDependencies ?? []) {
      if (blockNames.has(dep)) {
        if (!graph.has(dep)) {
          graph.set(dep, new Set());
        }
        blockDeps.add(dep);
        registryDependencies.add(`${GITHUB_REGISTRY_REF}/${dep}`);
      } else if (!dep.includes("/")) {
        registryDependencies.add(officialBaseItemUrl(dep));
      } else {
        registryDependencies.add(dep);
      }
    }

    const files: RegistryFile[] = sourceFiles.map((file) => {
      const relPath = relative(blockDir, file);
      const extension = file.slice(file.lastIndexOf("."));
      return {
        // path 指向仓库内真实源文件（相对 registry.json 所在的仓库根）：
        // `shadcn registry validate` 与 GitHub raw 拉取都按此路径读取；
        // content 同时内联，registry/dist/r 静态托管通道可直接使用。
        path: relative(ROOT, file),
        type: fileTypeFor(extension),
        target: `${meta.targetDir}/${relPath}`,
        content: readFileSync(file, "utf8"),
      };
    });

    for (const file of sourceFiles) {
      const source = readFileSync(file, "utf8");
      for (const specifier of collectImports(source)) {
        const relFile = relative(ROOT, file);

        if (specifier.startsWith("@/components/blocks/")) {
          const targetKey = specifier.slice("@/components/blocks/".length);
          const match = [...metas.keys()].find(
            (candidate) => targetKey === candidate || targetKey.startsWith(`${candidate}/`),
          );
          if (!match) {
            fail(
              `${relFile}: imports unknown block "${specifier}" (known: ${[...metas.keys()].join(", ")})`,
            );
          }
          const targetName = metas.get(match)?.meta.name;
          if (targetName) {
            blockDeps.add(targetName);
            registryDependencies.add(`${GITHUB_REGISTRY_REF}/${targetName}`);
          }
          continue;
        }

        if (specifier === "@/components/ui" || specifier === "@/components/ui/") {
          fail(
            `${relFile}: barrel import "${specifier}" cannot be resolved to a concrete official component — ` +
              'import a specific "@/components/ui/<name>" instead',
          );
        }
        if (specifier.startsWith("@/components/ui/")) {
          // 宿主 ui 别名 = 官方 base-nova 组件：钉扎为完整 URL 加入 registryDependencies
          //（即使存在同名我方 block——ui 路径永远指官方，我方 block 走 @/components/blocks/*）
          const name = specifier.slice("@/components/ui/".length).split("/")[0];
          if (!name) {
            fail(`${relFile}: invalid ui import "${specifier}"`);
          }
          registryDependencies.add(officialBaseItemUrl(name));
          continue;
        }

        if (specifier.startsWith("@/lib/") || specifier.startsWith("@/hooks/")) {
          // 宿主项目别名，保留原样（用户 components.json aliases 解析）
          continue;
        }

        if (specifier.startsWith("@/")) {
          fail(
            `${relFile}: blocks must not import demo code (found "${specifier}"; ` +
              "allowed: @/components/ui/*, @/components/blocks/*, @/lib/*, @/hooks/*, npm packages)",
          );
        }

        if (specifier.startsWith(".")) {
          const resolved = resolve(dirname(file), specifier);
          if (!resolved.startsWith(blockDir)) {
            fail(`${relFile}: relative import "${specifier}" escapes the block directory`);
          }
          continue;
        }

        // 裸 npm 说明符
        if (specifier === CORE_PACKAGE || specifier.startsWith(`${CORE_PACKAGE}/`)) {
          const versioned = `${CORE_PACKAGE}@^${coreVersion}`;
          dependencies.delete(CORE_PACKAGE);
          dependencies.add(versioned);
          continue;
        }
        if (!IMPLICIT_NPM_IMPORTS.has(specifier) && !specifier.startsWith("react/")) {
          const bare = specifier.startsWith("@")
            ? specifier.split("/").slice(0, 2).join("/")
            : specifier.split("/")[0];
          if (specifier === bare && ![...dependencies].some((d) => depName(d) === bare)) {
            dependencies.add(bare);
          }
        }
      }
    }

    graph.set(meta.name, blockDeps);

    // pattern（M7-C2）：契约卡以 file 形态并入（type registry:file——消费端 shadcn add 得到
    // .md 落盘；顶层 pattern 字段会被 CLI zod parse 剥离，契约卡经 files 通道分发不受影响）
    const pattern = patternInfo.get(meta.name);
    if (pattern) {
      files.push({
        path: relative(ROOT, pattern.cardPath),
        type: "registry:file",
        target: `${meta.targetDir}/${basename(pattern.cardPath)}`,
        content: readFileSync(pattern.cardPath, "utf8"),
      });
    }

    blockItems.push({
      $schema: "https://ui.shadcn.com/schema/registry-item.json",
      name: meta.name,
      type: meta.type,
      ...(meta.title ? { title: meta.title } : {}),
      ...(meta.description ? { description: meta.description } : {}),
      // archetype 透传到 item 顶层（schema additionalProperties 开放，validate 不拒）；
      // M7-B1 消费做同原型 slot 结构一致性校验，vocab:generate 消费产 BLOCKS_BY_ARCHETYPE。
      ...(meta.archetype ? { archetype: meta.archetype } : {}),
      // pattern 透传到 item 顶层（同上开放；CLI 消费端会被剥离——仓内工具读源 meta.json）
      ...(pattern ? { pattern: pattern.pattern } : {}),
      files,
      dependencies: [...dependencies].sort(),
      registryDependencies: [...registryDependencies].sort(),
    });
    console.log(
      `  block ${key} → dist/r/${meta.name}.json (${files.length} files${pattern ? ", pattern" : ""})`,
    );
  }

  // 环检测
  const state = new Map<string, "visiting" | "done">();
  const visit = (node: string, trail: string[]): void => {
    const current = state.get(node);
    if (current === "visiting") {
      fail(`circular registryDependencies: ${[...trail, node].join(" → ")}`);
    }
    if (current === "done") return;
    state.set(node, "visiting");
    for (const next of graph.get(node) ?? []) {
      visit(next, [...trail, node]);
    }
    state.set(node, "done");
  };
  for (const node of graph.keys()) {
    visit(node, []);
  }

  // 输出（blocks + themes + skills 通道一 item）
  const items = [...blockItems, ...buildThemeItems(), ...buildSkillsItem()];
  rmSync(join(ROOT, "registry", "dist"), { recursive: true, force: true });
  mkdirSync(DIST_DIR, { recursive: true });
  for (const item of items) {
    writeFileSync(join(DIST_DIR, `${item.name}.json`), `${JSON.stringify(item, null, 2)}\n`);
  }

  const registryIndex = {
    $schema: "https://ui.shadcn.com/schema/registry.json",
    name: "@patterns-ui",
    homepage: "https://github.com/patterns-ui/patterns-ui",
    items,
  };
  writeFileSync(join(ROOT, "registry.json"), `${JSON.stringify(registryIndex, null, 2)}\n`);

  console.log(
    `\nregistry:build done — ${items.length} item(s): registry/dist/r/*.json + registry.json (repo index, committed)`,
  );
}

void main();
