#!/usr/bin/env node
/**
 * consistency-score —— 一致性分数（M7-B3，docs/paradigm.md §6 B3 / §2.3 / §3.5）。
 *
 * 口径 = 可枚举检查项计数（非平均值：新增页面/代码不稀释既有计数，反向指标只许降、
 * 正向指标只许升）。机械化子集源自 §2.3 复审债务清单：
 *
 *   反向指标（lower is better，恶化 = 上升）
 *   1. handRolledQueryKeyArrays —— 手拼 queryKey 数组：`queryKey: [` 直写数组字面量，
 *      而非 listKey/detailKey/manyKey 出口（core/src/data/query-keys.ts 单源）。
 *      扫描域：packages/core/src + registry/blocks + apps/demo/src（含路由胶水与
 *      components/ 渲染出口——ad-hoc 查询同样是手拼）。
 *   2. handRolledLocalStorage —— 裸 localStorage 读写：`localStorage[?.](getItem|
 *      setItem|removeItem)(`，而非 createStorage（core/storage 单源）。命中含运行时
 *      语义的一切出现（字符串模板内联脚本同样计数，如 theme 防闪脚本）；注释行过滤。
 *   3. handRolledDebounceTimers —— 手写防抖/延迟计时器：`return () => clearTimeout(`
 *      的 effect 内延迟计时惯用法，而非 useDebouncedCallback（core/debounce 单源）。
 *      注：本模式同时覆盖「防抖」（reference-select 搜索词）与「同型延迟重置计时器」
 *      （cell-id 复制反馈）——从严计入，零漏报优先。
 *   4. pagesWithJsx —— apps/demo/src/pages/ 内含 JSX 痕迹（正则 "<[A-Z][a-zA-Z]*"）的文件数
 *      （M7-A3 验收命令同型；目标恒 0）。
 *   5. manualBlockImportRoutes —— 豁免清单外手工 import block 的路由数
 *      （`@/components/blocks/**`；resource-list-view / resource-detail-view 两个
 *      视图工厂渲染出口是 A3 批1 认可形态，不计）。豁免判定 = 文件头注释含
 *      【M7-A3 豁免清单】（A3 豁免机制本身即头注释）。
 *   6. sandboxItems —— registry/blocks/sandbox/ 的 item 数（*.meta.json 计数；
 *      §3.5 sandbox 使用率，持续偏高 = 词表欠债；现无此目录 = 0）。
 *
 *   正向指标（higher is better，恶化 = 下降）
 *   7. vocabCoverage —— apps/demo/src/pages/*.page.ts 中引用词表配置形态的比例：
 *      命中任一标记 = import @patterns-ui/core/page（definePage/defineFlow/
 *      PageRenderer）/ import tables（注入子表）/ import 视图工厂
 *      （resource-list-view / resource-detail-view）。total 下降视为恶化
 *      （M7 基线 18 页，A3 验收钉死）。
 *
 * 白名单（不计入；理由写在条目上）：
 *   - 测试文件：*.test.ts / *.test.tsx（含 inline.test.tsx 等）。
 *   - packages/core/src/storage/index.ts —— createStorage 实现本身（单源收敛点）。
 *   - packages/core/src/debounce.ts —— useDebouncedCallback 实现本身（单源收敛点）。
 *
 * 用法（node ≥18，零依赖）：
 *   node scripts/consistency-score.mjs              # 计算并打印报告（不写文件）
 *   node scripts/consistency-score.mjs --baseline   # 生成/重生成基线 scores.json（仓库根）
 *   node scripts/consistency-score.mjs --check      # 重算并与基线比对：恶化即退出码 1
 *
 * 确定性：同 commit 重跑结果 bit 级一致——occurrences 按路径+行号排序；timestamp 只进
 * stdout 报告、永不入库、永不参与比较；口径变更时递增 SCORE_VERSION 并重生成基线。
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCORES_PATH = join(ROOT, "scores.json");

/** 口径版本：任何检查项/模式/白名单语义变更时 +1 并重生成基线。 */
const SCORE_VERSION = 1;

// ---------------------------------------------------------------- 扫描域与白名单

const SCAN_ROOTS = ["packages/core/src", "registry/blocks", "apps/demo/src"];

const FILE_WHITELIST = new Set([
  // createStorage 实现本身：单源收敛点，裸读写是其职责。
  "packages/core/src/storage/index.ts",
  // useDebouncedCallback 实现本身：防抖单源，clearTimeout/setTimeout 是其职责。
  "packages/core/src/debounce.ts",
]);

const PAGES_DIR = "apps/demo/src/pages";
const ROUTES_DIR = "apps/demo/src/routes";
const SANDBOX_DIR = "registry/blocks/sandbox";

/** A3 批1 认可的视图工厂渲染出口（路由胶水 import 工厂组件不算手工 block import）。 */
const FACTORY_MODULES = ["resource-list-view", "resource-detail-view"];
const EXEMPT_MARKER = "【M7-A3 豁免清单】";

const TEST_FILE = /\.test\.(ts|tsx)$/;

// ---------------------------------------------------------------- 模式（机械 grep）

const PATTERNS = {
  /** queryKey: [ —— 直写数组字面量（非 listKey/detailKey/manyKey 出口）。 */
  queryKeyArray: /queryKey\s*:\s*\[/g,
  /** localStorage.getItem/setItem/removeItem（含 ?. 可选链形态）。 */
  localStorageCall: /localStorage\??\.(?:getItem|setItem|removeItem)\s*\(/g,
  /** return () => clearTimeout( —— 手写 effect 内延迟计时惯用法（防抖/延迟重置）。 */
  handRolledTimer: /return\s*\(\s*\)\s*=>\s*clearTimeout\s*\(/g,
  /** pages 内 JSX 痕迹（与 A3 验收命令 grep -rEl '<[A-Z][a-zA-Z]*' 同型）。 */
  jsxTrace: /<[A-Z][a-zA-Z]*/,
};

// 词表配置形态标记（*.page.ts 命中任一即计入 covered）
const VOCAB_MARKERS = [
  // definePage / defineFlow / PageRenderer（core/page 出口）
  /from\s+["']@patterns-ui\/core\/page["']/,
  // 注入子表（./tables 或 @/pages/tables）
  /from\s+["'](?:@\/pages\/|\.{1,2}\/)tables["']/,
  // 视图工厂（resource-list-view / resource-detail-view）
  /from\s+["'][^"']*\/(?:resource-list-view|resource-detail-view)["']/,
];

// ---------------------------------------------------------------- 文件遍历

function listFiles(dirRel, { recursive = true, exts = [".ts", ".tsx"] } = {}) {
  const dirAbs = join(ROOT, dirRel);
  if (!existsSync(dirAbs)) return [];
  const out = [];
  const entries = readdirSync(dirAbs, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : a.name > b.name ? 1 : 0,
  );
  for (const entry of entries) {
    const rel = `${dirRel}/${entry.name}`;
    if (entry.isDirectory()) {
      if (recursive) out.push(...listFiles(rel, { recursive, exts }));
      continue;
    }
    if (exts.some((e) => entry.name.endsWith(e))) out.push(rel);
  }
  return out;
}

/** 纯注释行（JSDoc `*` 续行 / `//` 行注释 / `/*` 开块）——防御性过滤，避免注释误报。 */
function isCommentLine(line) {
  const t = line.trimStart();
  return t.startsWith("*") || t.startsWith("//") || t.startsWith("/*");
}

/** 逐行匹配（跳过注释行），返回 `${relPath}:${lineNo}` 列表（已按 路径+行号 排序）。 */
function scanPattern(files, regex) {
  const hits = [];
  for (const rel of files) {
    const lines = readFileSync(join(ROOT, rel), "utf8").split("\n");
    lines.forEach((line, i) => {
      if (isCommentLine(line)) return;
      // 重置 lastIndex：全局正则逐行复用
      regex.lastIndex = 0;
      if (regex.test(line)) hits.push(`${rel}:${i + 1}`);
    });
  }
  return hits.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

// ---------------------------------------------------------------- 各检查项

function collectSourceFiles() {
  return SCAN_ROOTS.flatMap((root) =>
    listFiles(root).filter((rel) => !TEST_FILE.test(rel) && !FILE_WHITELIST.has(rel)),
  );
}

function countHandRolled(files) {
  return {
    handRolledQueryKeyArrays: {
      count: 0,
      occurrences: scanPattern(files, PATTERNS.queryKeyArray),
    },
    handRolledLocalStorage: {
      count: 0,
      occurrences: scanPattern(files, PATTERNS.localStorageCall),
    },
    handRolledDebounceTimers: {
      count: 0,
      occurrences: scanPattern(files, PATTERNS.handRolledTimer),
    },
  };
}

function countPagesWithJsx() {
  const files = [];
  for (const rel of listFiles(PAGES_DIR)) {
    const content = readFileSync(join(ROOT, rel), "utf8");
    if (PATTERNS.jsxTrace.test(content)) files.push(rel);
  }
  return { count: files.length, files: files.sort() };
}

function countVocabCoverage() {
  const pages = listFiles(PAGES_DIR).filter((rel) => rel.endsWith(".page.ts"));
  const uncovered = [];
  for (const rel of pages) {
    const content = readFileSync(join(ROOT, rel), "utf8");
    if (!VOCAB_MARKERS.some((re) => re.test(content))) uncovered.push(rel);
  }
  uncovered.sort();
  return {
    total: pages.length,
    covered: pages.length - uncovered.length,
    uncovered,
  };
}

function countManualBlockImportRoutes() {
  const routes = [];
  const importRe = /from\s+["'](@\/components\/blocks\/[^"']+)["']/g;
  for (const rel of listFiles(ROUTES_DIR)) {
    const content = readFileSync(join(ROOT, rel), "utf8");
    if (content.includes(EXEMPT_MARKER)) continue; // A3 豁免清单（头注释即豁免凭证）
    importRe.lastIndex = 0;
    let m = importRe.exec(content);
    while (m !== null) {
      const module = m[1];
      if (!FACTORY_MODULES.some((f) => module.includes(f))) {
        routes.push(`${rel} → ${module}`);
        break; // 每个路由文件计 1（棘轮关注"有没有"，非"多少处"）
      }
      m = importRe.exec(content);
    }
  }
  return { count: routes.length, routes: routes.sort() };
}

function countSandboxItems() {
  const items = listFiles(SANDBOX_DIR)
    .filter((rel) => rel.endsWith(".meta.json"))
    .map((rel) => rel.slice(`${SANDBOX_DIR}/`.length));
  return { count: items.length, items: items.sort() };
}

/** 计算全部指标（确定性：无时间戳、无随机、集合序稳定）。 */
function computeMetrics() {
  const files = collectSourceFiles();
  const metrics = {
    ...countHandRolled(files),
    pagesWithJsx: countPagesWithJsx(),
    vocabCoverage: countVocabCoverage(),
    manualBlockImportRoutes: countManualBlockImportRoutes(),
    sandboxItems: countSandboxItems(),
  };
  for (const m of [
    metrics.handRolledQueryKeyArrays,
    metrics.handRolledLocalStorage,
    metrics.handRolledDebounceTimers,
  ]) {
    m.count = m.occurrences.length;
  }
  return metrics;
}

// ---------------------------------------------------------------- 汇总 JSON 与比对

function scoresFileContent(metrics) {
  return `${JSON.stringify(
    {
      version: SCORE_VERSION,
      comment:
        "一致性分数基线（M7-B3）。生成：node scripts/consistency-score.mjs --baseline；" +
        "CI 校验：node scripts/consistency-score.mjs --check（任一反向指标上升/正向指标下降 = 退出码 1）。" +
        "timestamp 有意不入库（同 commit 重跑 bit 级一致）；口径变更递增 version 并重生成。",
      metrics,
    },
    null,
    2,
  )}\n`;
}

/** 比对字段定义：direction = reverse（只许降）/ forward（只许升）。 */
function comparableValues(metrics) {
  const ratio = metrics.vocabCoverage;
  return [
    {
      key: "handRolledQueryKeyArrays",
      label: "手拼 queryKey 数组",
      direction: "reverse",
      value: metrics.handRolledQueryKeyArrays.count,
    },
    {
      key: "handRolledLocalStorage",
      label: "裸 localStorage 读写",
      direction: "reverse",
      value: metrics.handRolledLocalStorage.count,
    },
    {
      key: "handRolledDebounceTimers",
      label: "手写防抖/延迟计时器",
      direction: "reverse",
      value: metrics.handRolledDebounceTimers.count,
    },
    {
      key: "pagesWithJsx",
      label: "pages 含 JSX 文件数",
      direction: "reverse",
      value: metrics.pagesWithJsx.count,
    },
    {
      key: "manualBlockImportRoutes",
      label: "豁免外手工 block import 路由",
      direction: "reverse",
      value: metrics.manualBlockImportRoutes.count,
    },
    {
      key: "sandboxItems",
      label: "sandbox item 数",
      direction: "reverse",
      value: metrics.sandboxItems.count,
    },
    {
      key: "vocabCoverage.total",
      label: "配置页总数（*.page.ts）",
      direction: "forward",
      value: ratio.total,
    },
    {
      key: "vocabCoverage.covered",
      label: "词表覆盖页数",
      direction: "forward",
      value: ratio.covered,
    },
  ];
}

function checkAgainstBaseline(current, baseline) {
  if (baseline.version !== SCORE_VERSION) {
    return {
      ok: false,
      regressions: [
        `基线口径版本 v${baseline.version} ≠ 脚本口径 v${SCORE_VERSION}：口径已变更，请重生成基线（--baseline）并复核`,
      ],
      improvements: [],
    };
  }
  const cur = new Map(comparableValues(current).map((c) => [c.key, c]));
  const base = new Map(comparableValues(baseline.metrics).map((c) => [c.key, c]));
  const regressions = [];
  const improvements = [];
  for (const c of cur.values()) {
    const b = base.get(c.key);
    if (!b) {
      regressions.push(`${c.label}：基线缺失该字段（口径漂移），请重生成基线`);
      continue;
    }
    const worse = c.direction === "reverse" ? c.value > b.value : c.value < b.value;
    const better = c.direction === "reverse" ? c.value < b.value : c.value > b.value;
    if (worse)
      regressions.push(
        `${c.label}：${b.value} → ${c.value}（恶化 +${Math.abs(c.value - b.value)}）`,
      );
    else if (better) improvements.push(`${c.label}：${b.value} → ${c.value}（改善）`);
  }
  return { ok: regressions.length === 0, regressions, improvements };
}

// ---------------------------------------------------------------- 输出

function printReport(metrics, { timestamp } = {}) {
  const vc = metrics.vocabCoverage;
  const ratioPct = vc.total === 0 ? "n/a" : `${((vc.covered / vc.total) * 100).toFixed(1)}%`;
  const lines = [
    `一致性分数（口径 v${SCORE_VERSION}）${timestamp ? ` · ${timestamp}` : ""}`,
    "",
    "反向指标（只许降）",
    `  手拼 queryKey 数组        ${metrics.handRolledQueryKeyArrays.count}`,
    `  裸 localStorage 读写      ${metrics.handRolledLocalStorage.count}`,
    `  手写防抖/延迟计时器       ${metrics.handRolledDebounceTimers.count}`,
    `  pages 含 JSX 文件数       ${metrics.pagesWithJsx.count}`,
    `  豁免外手工 block import   ${metrics.manualBlockImportRoutes.count}`,
    `  sandbox item 数           ${metrics.sandboxItems.count}`,
    "",
    "正向指标（只许升）",
    `  词表覆盖页面比例          ${vc.covered}/${vc.total}（${ratioPct}）`,
    "",
  ];
  const detail = (title, arr) => {
    if (!arr?.length) return;
    lines.push(`${title}:`);
    for (const item of arr) lines.push(`  - ${item}`);
    lines.push("");
  };
  detail("手拼 queryKey 明细", metrics.handRolledQueryKeyArrays.occurrences);
  detail("裸 localStorage 明细", metrics.handRolledLocalStorage.occurrences);
  detail("手写计时器明细", metrics.handRolledDebounceTimers.occurrences);
  detail("pages JSX 明细", metrics.pagesWithJsx.files);
  detail("未覆盖词表的页面", metrics.vocabCoverage.uncovered);
  detail("手工 block import 路由", metrics.manualBlockImportRoutes.routes);
  detail("sandbox items", metrics.sandboxItems.items);
  return lines.join("\n");
}

// ---------------------------------------------------------------- main

function main() {
  const [mode] = process.argv.slice(2);
  const timestamp = new Date().toISOString();
  const metrics = computeMetrics();

  if (mode === "--baseline") {
    writeFileSync(SCORES_PATH, scoresFileContent(metrics));
    console.log(printReport(metrics, { timestamp }));
    console.log(
      `基线已写入 ${relative(ROOT, SCORES_PATH)}（口径 v${SCORE_VERSION}，无时间戳——同 commit 重跑 bit 级一致）`,
    );
    return 0;
  }

  if (mode === "--check") {
    if (!existsSync(SCORES_PATH)) {
      console.error(
        `未找到基线 ${SCORES_PATH}：先运行 node scripts/consistency-score.mjs --baseline 并提交入库`,
      );
      return 2;
    }
    const baseline = JSON.parse(readFileSync(SCORES_PATH, "utf8"));
    const { regressions, improvements } = checkAgainstBaseline(metrics, baseline);
    console.log(printReport(metrics, { timestamp }));
    if (regressions.length > 0) {
      console.log("恶化（反向指标上升 / 正向指标下降）：");
      for (const r of regressions) console.log(`  ✗ ${r}`);
      console.log(
        `\n基线（v${baseline.version}）：${relative(ROOT, SCORES_PATH)}。修复后重跑，或确属口径变更时递增 SCORE_VERSION 重生成。`,
      );
      return 1;
    }
    if (improvements.length > 0) {
      console.log("改善（可重生成基线入库，不自动写）：");
      for (const i of improvements) console.log(`  ✓ ${i}`);
      console.log("\n  node scripts/consistency-score.mjs --baseline");
    } else {
      console.log("✓ 与基线一致（全指标无恶化）");
    }
    return 0;
  }

  if (mode !== undefined) {
    console.error(`未知参数：${mode}（可用：--baseline / --check）`);
    return 2;
  }
  console.log(printReport(metrics, { timestamp }));
  return 0;
}

process.exit(main());
