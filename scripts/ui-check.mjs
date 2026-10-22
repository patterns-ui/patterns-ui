#!/usr/bin/env node
/**
 * ui:check —— 一条龙质量门（M7-B4，docs/paradigm.md §6-B4 / §8）。
 *
 * 按序编排 10 步并汇总：每步打印标题 + 耗时 + 结果；任一步失败**继续跑完**剩余步骤，
 * 最后汇总红步骤、总退出码 = 任一步失败即非零（失败要看到全貌，不遮蔽后续红）。
 *
 * 步骤（编号与 paradigm/milestones 文档一致）：
 *   1  typecheck        pnpm typecheck（含 demo tsr generate）
 *   2  lint             pnpm lint（biome 全仓）
 *   3  范式 lint        pnpm lint:eslint（eslint-plugin 四规则：pages 0 JSX/裸原语/hex/冻结）
 *   4  archetype/slot   pnpm slots:check（meta ↔ vocab ↔ slot 三方）
 *   5  产物新鲜度       pnpm build（vocab:generate + core + registry:build）后
 *                        git diff --exit-code -- registry.json registry/dist/r
 *                        'registry/themes/*.css' 'packages/core/src/vocab/blocks.generated.ts'
 *                        （与 CI 同口径；改源不改产物 = 红）
 *   6  三方一致核对     pnpm check:names（配置名字 ⊆ 注入表 ∪ sandbox 登记表）
 *   7  截图基线         pnpm ui:shots --check（三态基线 diff 即败）
 *   8  分数棘轮         pnpm ui:score --check（反向指标只许降/正向只许升）
 *   9  a11y 检查        pnpm ui:a11y（axe wcag2a/2aa；serious/critical 败，moderate 留账）
 *  10  chunk 预算       demo build + node scripts/chunk-budget.mjs（超限报警不失败）
 *
 * 旋钮（本地快跑；CI 不带旋钮全跑）：
 *   --skip <step[,step...]>   豁免指定步骤（逗号分隔，按编号或名称，如 --skip 7,shots）
 *   --fast                    = --skip 7,9,10 的静态快跑（浏览器/构建项全免）：
 *                              只跑 1-6 静态检查，不启浏览器不做 demo build
 *   --list                    只列步骤不执行
 *
 * 用法：pnpm ui:check [--fast | --skip 7,9 | --list]
 */
import { spawnSync } from "node:child_process";

// ---------------------------------------------------------------- 步骤定义

/** @returns {{ run: () => number, skip?: boolean }} run 返回退出码（0 = 绿） */
const steps = [
  {
    id: "1",
    name: "typecheck",
    title: "typecheck（pnpm -r typecheck）",
    run: () => shell("pnpm", ["typecheck"]),
  },
  {
    id: "2",
    name: "lint",
    title: "biome lint（pnpm lint）",
    run: () => shell("pnpm", ["lint"]),
  },
  {
    id: "3",
    name: "eslint",
    title: "范式 lint（pnpm lint:eslint：pages 0 JSX / 裸原语 / hex / registry 冻结）",
    run: () => shell("pnpm", ["lint:eslint"]),
  },
  {
    id: "4",
    name: "slots",
    title: "archetype/slot 三方一致（pnpm slots:check）",
    run: () => shell("pnpm", ["slots:check"]),
  },
  {
    id: "5",
    name: "freshness",
    title: "产物新鲜度（pnpm build 后 git diff --exit-code，与 CI 同口径）",
    run: () => {
      const build = shell("pnpm", ["build"]);
      if (build !== 0) return build;
      return shell("git", [
        "diff",
        "--exit-code",
        "--",
        "registry.json",
        "registry/dist/r",
        "registry/themes/*.css",
        "packages/core/src/vocab/blocks.generated.ts",
      ]);
    },
  },
  {
    id: "6",
    name: "names",
    title: "三方一致核对（pnpm check:names：配置名字 ⊆ 注入表 ∪ sandbox 登记表）",
    run: () => shell("pnpm", ["check:names"]),
  },
  {
    id: "7",
    name: "shots",
    title: "截图基线（pnpm ui:shots --check：三态基线 diff 即败）",
    browser: true,
    run: () => shell("pnpm", ["ui:shots", "--check"]),
  },
  {
    id: "8",
    name: "score",
    title: "分数棘轮（pnpm ui:score --check：反向只许降 / 正向只许升）",
    run: () => shell("pnpm", ["ui:score", "--check"]),
  },
  {
    id: "9",
    name: "a11y",
    title: "a11y 检查（pnpm ui:a11y：axe wcag2a/2aa，serious/critical 败）",
    browser: true,
    run: () => shell("pnpm", ["ui:a11y"]),
  },
  {
    id: "10",
    name: "budget",
    title: "chunk 体积预算（demo build + 报告：超限报警不失败）",
    build: true,
    run: () => {
      const build = shell("pnpm", ["--filter", "demo", "build"]);
      if (build !== 0) return build;
      return shell("node", ["scripts/chunk-budget.mjs"]);
    },
  },
];

const TOTAL_WIDTH = 64;

function shell(cmd, args) {
  const result = spawnSync(cmd, args, {
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  return result.status ?? 1;
}

const ms = (start) => `${((performance.now() - start) / 1000).toFixed(1)}s`;

// ---------------------------------------------------------------- 参数解析

const argv = process.argv.slice(2);
const skipArgs = [];
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === "--list") {
    console.log("ui:check 步骤：");
    for (const s of steps) console.log(`  ${s.id.padEnd(3)}${s.name.padEnd(12)}${s.title}`);
    process.exit(0);
  }
  if (arg === "--fast") {
    skipArgs.push("7", "9", "10"); // 浏览器两项 + demo build 项全免（6 步静态快跑）
    continue;
  }
  if (arg === "--skip") {
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) {
      console.error("--skip 需要步骤参数（如 --skip 7,shots）");
      process.exit(2);
    }
    skipArgs.push(
      ...value
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
    i++;
    continue;
  }
  console.error(`未知参数：${arg}（可用：--skip <steps> / --fast / --list）`);
  process.exit(2);
}

const skipSet = new Set();
for (const raw of skipArgs) {
  const byId = steps.find((s) => s.id === raw);
  const byName = steps.find((s) => s.name === raw);
  const step = byId ?? byName;
  if (step) {
    skipSet.add(step.id);
  } else {
    console.error(`--skip：未知步骤「${raw}」（按编号 1-10 或名称；--list 看全表）`);
    process.exit(2);
  }
}

// ---------------------------------------------------------------- 编排

console.log(`━`.repeat(TOTAL_WIDTH));
console.log(`ui:check 一条龙（M7-B4）· ${new Date().toISOString()}`);
if (skipSet.size > 0) {
  const skipped = steps.filter((s) => skipSet.has(s.id)).map((s) => `${s.id}:${s.name}`);
  console.log(`豁免旋钮生效——已跳过：${skipped.join("、")}（本地快跑；CI 全跑不带旋钮）`);
}
console.log(`━`.repeat(TOTAL_WIDTH));

const failures = [];
const results = [];
const totalStart = performance.now();

for (const step of steps) {
  if (skipSet.has(step.id)) {
    results.push({ step, status: "SKIP", duration: "-" });
    console.log(
      `\n[步骤 ${step.id}/${steps.length}] ${step.title}\n  ↷ 已跳过（--skip/--fast 旋钮）`,
    );
    continue;
  }
  console.log(
    `\n${`─`.repeat(TOTAL_WIDTH)}\n[步骤 ${step.id}/${steps.length}] ${step.title}\n${`─`.repeat(TOTAL_WIDTH)}`,
  );
  const start = performance.now();
  const code = step.run();
  const duration = ms(start);
  if (code === 0) {
    results.push({ step, status: "PASS", duration });
    console.log(`  ✓ 绿（${duration}）`);
  } else {
    results.push({ step, status: `FAIL(${code})`, duration });
    failures.push({ step, code });
    console.error(`  ✗ 红（退出码 ${code}，${duration}）——继续跑完剩余步骤`);
  }
}

// ---------------------------------------------------------------- 汇总

const totalDuration = ms(totalStart);
console.log(`\n${`━`.repeat(TOTAL_WIDTH)}\nui:check 汇总（总耗时 ${totalDuration}）`);
for (const { step, status, duration } of results) {
  const mark = status === "PASS" ? "✓" : status === "SKIP" ? "↷" : "✗";
  console.log(
    `  ${mark} ${step.id.padEnd(3)}${step.name.padEnd(11)}${status.padEnd(9)}${duration}`,
  );
}
console.log(`━`.repeat(TOTAL_WIDTH));

if (failures.length > 0) {
  console.error(`✗ ui:check 红：${failures.length} 步失败——`);
  for (const { step, code } of failures)
    console.error(`    步骤 ${step.id} ${step.name}（退出码 ${code}）`);
  process.exit(1);
}
console.log(
  `✓ ui:check 全绿（${skipSet.size > 0 ? `跳过 ${skipSet.size} 步` : "10 步全跑"}，总耗时 ${totalDuration}）。`,
);
process.exit(0);
