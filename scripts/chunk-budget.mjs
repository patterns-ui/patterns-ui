#!/usr/bin/env node
/**
 * chunk 体积预算报告（M7-B4，docs/paradigm.md §6-B4 / §8「性能」）。
 *
 * 解析 apps/demo/dist/assets/*.js 产物尺寸（vite build 输出，直接读文件大小——
 * 不引 rollup-plugin-visualizer）。超限 = 醒目报警但**不失败**（paradigm §8
 * 「超限报警」：预算是健康信号不是门禁；恶化由人工判断后调表）。
 *
 * 口径：
 *  - chunk 基名 = 文件名去掉尾部 `-<8位hash>.js`（vite content hash 可含 -/_，
 *    恰为 8 字符；基名跨构建稳定，预算表按基名锚定）；
 *  - 逐 chunk 预算表（下方 CHUNK_BUDGETS，单位 KiB）：初始值 = 2026-10-23 实测
 *    × 1.15 余量向上取整（实测见行尾注释）；表内未列的 chunk 走 DEFAULT_CHUNK_BUDGET；
 *  - 总预算 TOTAL_JS_BUDGET = 全部 .js 之和的预算（防「每个都不超、总量膨胀」）。
 *
 * 用法（node ≥18，零依赖；须先 pnpm --filter demo build）：
 *   node scripts/chunk-budget.mjs            # 报告（超限仅报警，恒退出码 0）
 *   node scripts/chunk-budget.mjs --table    # 按当前 dist 实测重算预算表初值（调表用）
 */
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const ASSETS_DIR = join(ROOT, "apps/demo/dist/assets");
const KIB = 1024;

/** 逐 chunk 预算（KiB）——超过 = 报警不失败。调表：改值并在 PR 里说明体积变化原因。 */
const CHUNK_BUDGETS = {
  skeleton: 282, // 244.9（sonner/shadcn skeleton 相关共享块）
  index: 274, // 237.4（入口）
  "confirm-dialog": 101, // 87.8
  "chunk-LTMUTHLP": 85, // 73.6（rollup 共享块）
  "pagination-bar": 81, // 69.7
  matchContext: 73, // 62.7
  "t._tenantId": 65, // 56.4（租户壳路由布局）
  select: 55, // 47.1
  button: 52, // 45.1
  tables: 47, // 40.6（pages/tables 注入子表图）
  "use-mobile": 43, // 37.1
  nav: 40, // 34.4
  dist: 39, // 33.2
  "services._id": 28, // 23.7
  "service-form": 26, // 22.0
};
/** 表外 chunk 的默认预算（新 chunk 或小 chunk；当前实测最大表外 chunk ≈ 12.6 KiB）。 */
const DEFAULT_CHUNK_BUDGET = 32; // KiB
/** 全部 .js 总量预算（KiB）。 */
const TOTAL_JS_BUDGET = 1449; // 实测 1259.3 × 1.15

// ---------------------------------------------------------------- 收集

function collectChunks() {
  if (!existsSync(ASSETS_DIR)) {
    return { chunks: new Map(), error: `未找到 ${ASSETS_DIR}——先运行 pnpm --filter demo build` };
  }
  const byBase = new Map();
  for (const file of readdirSync(ASSETS_DIR).sort()) {
    if (!file.endsWith(".js")) continue;
    const base = file.replace(/-([A-Za-z0-9_-]{8})\.js$/, "");
    if (base === file) continue; // 无 hash 后缀的非产物文件（不应出现）
    byBase.set(base, (byBase.get(base) ?? 0) + statSync(join(ASSETS_DIR, file)).size);
  }
  if (byBase.size === 0) return { chunks: byBase, error: "dist/assets 无 .js 产物" };
  return { chunks: byBase, error: undefined };
}

const fmtKiB = (bytes) => `${(bytes / KIB).toFixed(1)} KiB`;

// ---------------------------------------------------------------- main

const args = process.argv.slice(2);
const { chunks, error } = collectChunks();

if (error) {
  console.error(`✗ chunk 预算报告：${error}`);
  process.exit(2); // 产物缺失 = 执行序错误（ui:check 第 10 步先 build 再报告），红
}

if (args.includes("--table")) {
  // 调表模式：按当前实测重算预算初值（× 1.15 向上取整）
  console.log("// 实测 × 1.15 取整（KiB）：");
  const rows = [...chunks.entries()].sort((a, b) => b[1] - a[1]);
  for (const [base, size] of rows) {
    if (size >= 16 * KIB)
      console.log(`  ["${base}", ${Math.ceil((size * 1.15) / KIB)}], // ${fmtKiB(size)}`);
  }
  const total = rows.reduce((n, [, s]) => n + s, 0);
  console.log(`// TOTAL_JS_BUDGET = ${Math.ceil((total * 1.15) / KIB)} // ${fmtKiB(total)}`);
  process.exit(0);
}

// 报告模式
const rows = [...chunks.entries()].map(([base, size]) => ({
  base,
  size,
  budget: (CHUNK_BUDGETS[base] ?? DEFAULT_CHUNK_BUDGET) * KIB,
  named: base in CHUNK_BUDGETS,
}));
rows.sort((a, b) => b.size - a.size);
const total = rows.reduce((n, r) => n + r.size, 0);
const over = rows.filter((r) => r.size > r.budget);
const totalOver = total > TOTAL_JS_BUDGET * KIB;

const pad = (s, n) => s.padEnd(n, " ");
console.log("── chunk 体积预算报告（apps/demo/dist/assets/*.js）──────────────");
for (const r of rows) {
  const pct = ((r.size / r.budget) * 100).toFixed(0).padStart(3);
  const flag = r.size > r.budget ? "  ⚠ 超限" : "";
  const named = r.named ? "" : "（默认预算）";
  console.log(
    `  ${pad(r.base, 20)} ${pad(fmtKiB(r.size), 12)} / ${pad(`${r.budget / KIB} KiB`, 9)} ${pct}%${named}${flag}`,
  );
}
console.log("────────────────────────────────────────────────────────────────");
const totalPct = ((total / (TOTAL_JS_BUDGET * KIB)) * 100).toFixed(0);
console.log(
  `  合计 ${rows.length} 个 chunk（表内预算 ${Object.keys(CHUNK_BUDGETS).length} 项 + 默认 ${DEFAULT_CHUNK_BUDGET} KiB）：${fmtKiB(total)} / ${TOTAL_JS_BUDGET} KiB（${totalPct}%）`,
);

if (over.length > 0 || totalOver) {
  console.error("");
  console.error("  ⚠⚠ chunk 体积超预算（报警不失败——paradigm §8「超限报警」）：");
  for (const r of over) {
    console.error(
      `    ⚠ ${r.base}：${fmtKiB(r.size)} > ${r.budget / KIB} KiB（超 ${fmtKiB(r.size - r.budget)}）`,
    );
  }
  if (totalOver) {
    console.error(`    ⚠ 总量：${fmtKiB(total)} > ${TOTAL_JS_BUDGET} KiB`);
  }
  console.error(
    "    处置：优化拆分/依赖，或经评审后调 scripts/chunk-budget.mjs 预算表（--table 重算初值）。",
  );
} else {
  console.log("  ✓ 全部 chunk 在预算内。");
}
// 恒退出码 0（报警不失败）；产物缺失走上面的 exit 2
process.exit(0);
