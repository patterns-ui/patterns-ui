#!/usr/bin/env node
/**
 * @patterns-ui skills 渲染脚本（通道一内嵌渲染器，M7-D；docs/registry.md §4）。
 *
 * 消费端 `shadcn add patterns-ui/patterns-ui/skills` 后，三份 SKILL.md 与本脚本落在
 * `<project>/.patterns-ui/skills/`（staging，~ target = 项目根）。本脚本把 staging 里的
 * SKILL.md **按项目形态渲染**到所选宿主的 skills 目录——「按消费项目生成变体」的最小自实现：
 *   - 宿主选择：--host claude|zcode|agents|all（缺省 all → .claude/skills/ + .zcode/skills/ + .agents/skills/）；
 *   - pages 目录前缀：--pages-dir（缺省 src/pages）——正文里仓内 demo 页面路径 apps/demo/src/pages 改写为该值；
 *   - 包管理器：--pm pnpm|npm|yarn|bun（缺省按 lockfile 探测）——正文 pnpm 脚本调用改写为对应形态；
 *   - 剥离仓内同步尾注（「三宿主目录同步」注释是 patterns-ui 仓内的单源纪律，消费端无意义）；
 *   - 文首注入渲染横幅（渲染参数 + 词表事实源提示——消费端无 docs/patterns.md，词表单源 =
 *     @patterns-ui/core 的 typecheck 报错全表）。
 *
 * 零依赖（node:fs/path/url），幂等（重跑覆盖），可重复执行。
 *
 * 用法：
 *   node .patterns-ui/skills/render-skills.mjs                        # 三宿主全渲染（缺省）
 *   node .patterns-ui/skills/render-skills.mjs --host claude          # 只渲染 .claude/skills/
 *   node .patterns-ui/skills/render-skills.mjs --src .zcode/skills    # 源目录覆盖（缺省 = 脚本所在目录）
 *   node .patterns-ui/skills/render-skills.mjs --dry-run              # 只打印计划不落盘
 *   node .patterns-ui/skills/render-skills.mjs --root <dir>           # 目标项目根（缺省 = cwd）
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));

const HOST_DIRS = {
  claude: ".claude/skills",
  zcode: ".zcode/skills",
  agents: ".agents/skills",
};

const PM_RUN_PREFIX = {
  pnpm: "pnpm ",
  npm: "npm run ",
  yarn: "yarn ",
  bun: "bun run ",
};

const LOCKFILE_PM = [
  ["pnpm-lock.yaml", "pnpm"],
  ["package-lock.json", "npm"],
  ["yarn.lock", "yarn"],
  ["bun.lock", "bun"],
  ["bun.lockb", "bun"],
];

function usageAndExit(code) {
  const lines = [
    "用法: node render-skills.mjs [--host all|claude|zcode|agents] [--src <dir>] [--pages-dir <dir>]",
    "                            [--pm pnpm|npm|yarn|bun] [--root <dir>] [--dry-run]",
    "",
    "  --host       渲染目标宿主（缺省 all = claude + zcode + agents 三目录）",
    "  --src        SKILL.md 源目录（缺省 = 本脚本所在目录，即 add 落盘的 staging）",
    "  --pages-dir  消费端页面配置目录（缺省 src/pages；正文 apps/demo/src/pages 改写为该值）",
    "  --pm         包管理器（缺省按 lockfile 探测，无 lockfile 时 pnpm）；正文 pnpm 调用改写",
    "  --root       目标项目根（缺省 cwd）",
    "  --dry-run    只打印渲染计划，不落盘",
  ];
  (code === 0 ? console.log : console.error)(lines.join("\n"));
  process.exit(code);
}

function parseArgs(argv) {
  const opts = {
    host: "all",
    src: SCRIPT_DIR,
    pagesDir: "src/pages",
    pm: null,
    root: process.cwd(),
    dryRun: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];
    if (arg === "--help" || arg === "-h") {
      usageAndExit(0);
    } else if (arg === "--dry-run") {
      opts.dryRun = true;
    } else if (
      arg === "--host" ||
      arg === "--src" ||
      arg === "--pages-dir" ||
      arg === "--pm" ||
      arg === "--root"
    ) {
      if (next === undefined) {
        console.error(`render-skills: ${arg} 需要一个值`);
        usageAndExit(1);
      }
      i += 1;
      if (arg === "--host") {
        opts.host = next;
      } else if (arg === "--src") {
        opts.src = next;
      } else if (arg === "--pages-dir") {
        opts.pagesDir = next;
      } else if (arg === "--pm") {
        opts.pm = next;
      } else {
        opts.root = next;
      }
    } else {
      console.error(`render-skills: 未知参数 ${arg}`);
      usageAndExit(1);
    }
  }
  return opts;
}

function detectPackageManager(root) {
  for (const [lockfile, pm] of LOCKFILE_PM) {
    if (existsSync(join(root, lockfile))) {
      return pm;
    }
  }
  return "pnpm";
}

function resolveHosts(host) {
  if (host === "all") {
    return Object.keys(HOST_DIRS);
  }
  if (!Object.hasOwn(HOST_DIRS, host)) {
    console.error(
      `render-skills: 未知宿主 "${host}"（合法值：all、${Object.keys(HOST_DIRS).join(", ")}）`,
    );
    process.exit(1);
  }
  return [host];
}

/** 收集源 SKILL.md：<src>/<skill>/SKILL.md（staging 或仓内 .zcode/skills 同构） */
function collectSkillSources(src) {
  const skills = [];
  for (const entry of readdirSync(src, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : 1,
  )) {
    if (!entry.isDirectory()) continue;
    const skillFile = join(src, entry.name, "SKILL.md");
    if (existsSync(skillFile)) {
      skills.push({ name: entry.name, file: skillFile });
    }
  }
  if (skills.length === 0) {
    console.error(
      `render-skills: ${src} 下未找到任何 <skill>/SKILL.md（--src 指错？staging 应含 ui-page/ui-block/ui-theme）`,
    );
    process.exit(1);
  }
  return skills;
}

/** 按项目形态渲染正文：pages 前缀改写 + 包管理器改写 + 剥离仓内同步尾注 + 注入渲染横幅 */
function renderSkill(source, pagesDir, pmPrefix, pmName) {
  let body = source;
  // ① 仓内 demo 页面路径 → 消费端 pages 目录（demo/无 demo 项目的前缀差异）
  body = body.replaceAll("apps/demo/src/pages", pagesDir);
  // ② pnpm 脚本调用 → 消费端包管理器形态（SKILL.md 只含 run-script 形态调用，无 install/dlx）
  body = body.replaceAll("pnpm ", pmPrefix);
  // ③ 剥离仓内单源同步尾注（消费端没有三目录同步纪律）
  body = body.replace(/<!-- 三宿主目录同步：[\s\S]*?-->\n?/g, "").replace(/\s+$/, "\n");
  // ④ 文首横幅（frontmatter 之后）：渲染参数回显 + 消费端词表事实源提示
  const banner = [
    "> 渲染自 @patterns-ui skills item（`node .patterns-ui/skills/render-skills.mjs` 重跑更新）：",
    `> 本副本已按本项目形态调整——pages 目录 \`${pagesDir}\`、包管理器 \`${pmName}\`。`,
    "> 消费端无 patterns-ui 仓内 docs/patterns.md：词表事实源 = @patterns-ui/core 的 typecheck",
    "> 报错全表（写错名字即列全部合法值）；运行时名 → 组件经 core/page 注入表解析。",
    "",
  ].join("\n");
  const fm = body.match(/^---\n[\s\S]*?\n---\n/);
  if (fm) {
    body = body.slice(fm[0].length);
    return `${fm[0]}\n${banner}\n${body}`;
  }
  return `${banner}\n${body}`;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const hosts = resolveHosts(opts.host);
  const src = resolve(opts.src);
  const root = resolve(opts.root);
  const pm = opts.pm ?? detectPackageManager(root);
  if (!Object.hasOwn(PM_RUN_PREFIX, pm)) {
    console.error(
      `render-skills: 未知包管理器 "${pm}"（合法值：${Object.keys(PM_RUN_PREFIX).join(", ")}）`,
    );
    process.exit(1);
  }
  const skills = collectSkillSources(src);
  console.log(
    `render-skills: ${skills.length} 个 skill ← ${src} → 宿主 [${hosts.join(", ")}] @ ${root}` +
      `（pages-dir: ${opts.pagesDir}, pm: ${pm}${opts.dryRun ? ", dry-run" : ""}）`,
  );
  for (const host of hosts) {
    for (const skill of skills) {
      const target = join(root, HOST_DIRS[host], skill.name, "SKILL.md");
      const rendered = renderSkill(
        readFileSync(skill.file, "utf8"),
        opts.pagesDir,
        PM_RUN_PREFIX[pm],
        pm,
      );
      if (opts.dryRun) {
        console.log(`  [dry-run] ${skill.name} → ${target}（${rendered.length} bytes）`);
        continue;
      }
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, rendered);
      console.log(`  ${skill.name} → ${target}`);
    }
  }
  if (!opts.dryRun) {
    console.log(
      `render-skills: done（${hosts.length} 宿主 × ${skills.length} skill；重跑幂等覆盖）`,
    );
  }
}

main();
