#!/usr/bin/env node
/**
 * registry 消费端冒烟（M6-A，CI job `registry-consumer`；本地 `pnpm registry:smoke`）。
 *
 * 在 mkdtemp 的临时目录手搓最小 vite+react19+ts 工程（不跑 create-vite），用本地 http server
 * 托管 registry/dist，`shadcn add` 我们的 theme-default + status-badge，vite build 后对产物
 * css 做 headless 令牌断言：
 *   ① `--status-success:` 令牌定义存在（值来自 theme preset 的 oklch）；
 *   ② 存在消费 `var(--status-success)` 的 utility（`.text-status-success{color:var(--status-success)}`，
 *      由 theme 产物内的 `@theme inline` 映射生成）；
 *   ③ 该 utility 规则内无硬编码色值。
 *
 * M7-C2 追加：**pattern item 的 CLI 分发冒烟（dry-run）**——`shadcn add audit-log --dry-run`
 * 经独立 overlay server 解析整棵依赖树（dist 全集复制 + 自引用 `patterns-ui/patterns-ui/*`
 * 改写为本 server URL——CI 无私有仓库 token，改写只换解析源不换依赖图；官方 ui.shadcn.com
 * URL 原样）。断言 dry-run 退出 0 且计划提及组装入口（pattern 顶层字段被 CLI zod parse
 * 静默剥离是已知且已记录的坑——契约卡经 files 通道分发不受影响，此处钉住"解析不炸"）。
 *
 * M7-D 追加：**消费端 typecheck 防线**——`pnpm --filter @patterns-ui/core pack` 产 tarball，
 * 同一 tmp 项目 `pnpm add @patterns-ui/core@file:<tarball>`（模拟装包，不触 npm publish），
 * 写引用 BlockName/CellName/PageBlockNameFor 的配置文件：写对 → `tsc --noEmit` 绿；
 * 改写词表外名字（cell-statuz）→ tsc 红**且报错列出全部合法 cell 名**（断言输出含
 * CELL_NAMES 全表，特征 ≥9 名）；还原 → 复绿。旋钮 SMOKE_SKIP_TYPES=1 跳过本段。
 *
 * 前置：仓库根已跑 `pnpm build`（registry/dist 由 registry:build 产出；core dist 由 tsup 产出——
 * pack 只打包已构建产物）。
 * 注意：shadcn CLI 在本机有网络挂起史（CI 正常）——本脚本各步骤带超时，挂起即失败退出；
 * CI 是权威判官。本机可用 SMOKE_SKIP_ADD=1 跳过 add 与 dry-run：两个文件直接从仓库源拷到
 * CLI 相同落点（src/theme/<name>.css、src/components/blocks/shared/status-badge/…），下游接线/
 * 构建/断言与真实路径完全一致（dry-run 属 CLI 网络路径，无离线等价物）。typecheck 防线不依赖
 * shadcn CLI，SMOKE_SKIP_ADD 下照常运行（pnpm add file: 走本地 tarball + registry 装 peers）。
 */
import { spawn, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST_DIR = join(ROOT, "registry", "dist");
const CORE_PACKAGE = "@patterns-ui/core";
/** 词表生成物单源（typecheck 防线断言的期望 cell 全表从此读取——脚本自带全表副本会漂移） */
const VOCAB_GENERATED = join(ROOT, "packages", "core", "src", "vocab", "blocks.generated.ts");
// 单步超时：CI 冷缓存下 pnpm dlx shadcn 首次拉包可能偏慢；真挂起（远超此值）则失败退出而非无限等
const STEP_TIMEOUT_MS = 8 * 60_000;
// shadcn 包版本可覆盖（本机网络对最新版 CLI 的 ui.shadcn.com 拉取不稳时，用旧版复现真实路径调试）
const SHADCN_SPEC = process.env.SMOKE_SHADCN_PKG ?? "shadcn@latest";

/** 与 workspace catalog 对齐的最小消费端依赖（react19 + vite + tailwind v4） */
const TMP_PACKAGE_JSON = {
  name: "registry-consumer-smoke",
  private: true,
  type: "module",
  scripts: { build: "vite build" },
  dependencies: {
    react: "19.3.1",
    "react-dom": "19.3.1",
  },
  devDependencies: {
    // @types/node：vite.config.ts import "node:url"，M7-D 起 tsc --noEmit 覆盖该文件
    "@types/node": "22.20.5",
    "@tailwindcss/vite": "4.3.3",
    "@types/react": "19.3.0",
    "@types/react-dom": "19.3.0",
    "@vitejs/plugin-react": "6.1.2",
    tailwindcss: "4.3.3",
    typescript: "5.9.3",
    vite: "8.3.5",
  },
};

const TMP_TSCONFIG = {
  compilerOptions: {
    target: "ES2022",
    lib: ["ES2022", "DOM", "DOM.Iterable"],
    module: "ESNext",
    moduleResolution: "bundler",
    jsx: "react-jsx",
    strict: true,
    skipLibCheck: true,
    noEmit: true,
    baseUrl: ".",
    // shadcn CLI 依据 tsconfig paths 把 components.json 的 @/ 别名换算成磁盘路径
    paths: { "@/*": ["./src/*"] },
  },
  include: ["src", "vite.config.ts"],
};

const TMP_VITE_CONFIG = `import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: [
      { find: "@/components/blocks", replacement: fileURLToPath(new URL("./src/components/blocks", import.meta.url)) },
      { find: "@", replacement: fileURLToPath(new URL("./src", import.meta.url)) },
    ],
  },
});
`;

const TMP_INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <title>registry consumer smoke</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

const TMP_MAIN_TSX = `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
// css 必须进模块图，vite 才会产出 css asset（headless 断言对象）
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`;

/** 与 demo 相同形态（style 钉 base-nova；tailwind.css 指向 src/index.css） */
const TMP_COMPONENTS_JSON = {
  $schema: "https://ui.shadcn.com/schema.json",
  style: "base-nova",
  rsc: false,
  tsx: true,
  tailwind: {
    config: "",
    css: "src/index.css",
    baseColor: "neutral",
    cssVariables: true,
  },
  iconLibrary: "lucide",
  aliases: {
    components: "@/components",
    ui: "@/components/ui",
    utils: "@/lib/utils",
    lib: "@/lib",
    hooks: "@/hooks",
  },
};

function fail(message) {
  console.error(`\n[smoke] FAIL: ${message}`);
  process.exitCode = 1;
  throw new Error(message);
}

function run(label, command, args, opts = {}) {
  console.log(`\n[smoke] ${label}: ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: "inherit",
    timeout: STEP_TIMEOUT_MS,
    ...opts,
  });
  if (result.error) {
    fail(`${label} failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    fail(`${label} exited with ${result.status}`);
  }
}

/** 同 run 但捕获 stdout/stderr（dry-run 输出断言用），失败时先回显输出再失败 */
function runCapture(label, command, args, opts = {}) {
  console.log(`\n[smoke] ${label}: ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    timeout: STEP_TIMEOUT_MS,
    encoding: "utf8",
    ...opts,
  });
  if (result.error) {
    fail(`${label} failed to start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    console.log(result.stdout ?? "");
    console.error(result.stderr ?? "");
    fail(`${label} exited with ${result.status}`);
  }
  return result;
}

/**
 * runCapture 的反向形态：**期望非零退出**（typecheck 防线的"写错必红"断言用）。
 * 退出 0 = 防线失效（词表收窄未生效），视为失败；非零则返回捕获的输出供内容断言。
 */
function runExpectFail(label, command, args, opts = {}) {
  console.log(`\n[smoke] ${label}: ${command} ${args.join(" ")} (expecting failure)`);
  const result = spawnSync(command, args, {
    stdio: ["ignore", "pipe", "pipe"],
    timeout: STEP_TIMEOUT_MS,
    encoding: "utf8",
    ...opts,
  });
  if (result.error) {
    fail(`${label} failed to start: ${result.error.message}`);
  }
  if (result.status === 0) {
    fail(
      `${label} exited 0 — the vocab typecheck line did NOT catch the bad name (defense broken)`,
    );
  }
  return result;
}

/** 递归列文件（跳过 node_modules / dist / .git） */
function listFiles(dir, acc = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name === "dist" || entry.name === ".git") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      listFiles(full, acc);
    } else if (entry.isFile()) {
      acc.push(full);
    }
  }
  return acc;
}

/**
 * 静态 server 源码（独立子进程跑）：托管 registry/dist，content-type application/json。
 * **必须独立进程**——shadcn add 走 spawnSync 会阻塞本进程事件循环，内嵌 server 无法
 * accept/响应请求（连接停在内核 backlog 直到超时，CI 首跑即栽在此），故 server 外置。
 * 就绪协议：监听成功后向 stdout 打印 `READY <port>`。
 */
const SERVER_SOURCE = String.raw`
const { createServer } = require("node:http");
const { existsSync, readFileSync, statSync } = require("node:fs");
const { join } = require("node:path");
const distDir = process.argv[1];
const server = createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://127.0.0.1").pathname);
  const filePath = join(distDir, pathname.replace(/^\/+/, ""));
  if (!filePath.startsWith(distDir) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    res.writeHead(404, { "content-type": "text/plain" });
    res.end("not found: " + pathname);
    return;
  }
  res.writeHead(200, { "content-type": "application/json" });
  res.end(readFileSync(filePath));
});
server.listen(0, "127.0.0.1", () => console.log("READY " + server.address().port));
`;

/** 静态 server 托管任意目录（serveDir 参数化：dist 与 dry-run overlay 共用） */
function serveDir(serveDir) {
  return new Promise((resolvePromise, rejectPromise) => {
    const proc = spawn(process.execPath, ["-e", SERVER_SOURCE, serveDir], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    let buffer = "";
    let settled = false;
    const timer = setTimeout(() => {
      proc.kill();
      rejectPromise(new Error("registry dist server not ready within 15s"));
    }, 15_000);
    const done = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn(value);
    };
    proc.stdout.on("data", (chunk) => {
      buffer += chunk;
      const match = buffer.match(/READY (\d+)/);
      if (match) {
        done(resolvePromise, { proc, port: Number(match[1]) });
      }
    });
    proc.on("error", (error) => done(rejectPromise, error));
    proc.on("exit", () => {
      if (!/READY (\d+)/.test(buffer)) {
        done(rejectPromise, new Error("registry dist server exited before ready"));
      }
    });
  });
}

/**
 * M7-C2 dry-run overlay：复制 dist 全集并把自引用 `patterns-ui/patterns-ui/<name>` 改写为
 * `http://127.0.0.1:<port>/r/<name>.json`（CI 无私有仓库 token；改写只换解析源不换依赖图，
 * 官方 ui.shadcn.com URL 原样——CI 可达）。全量改写使依赖树各层都在本 server 解析。
 * 落点 `tmp/registry-overlay/`（目录先建、server 先起、文件后写——server 按请求查盘）。
 */
function buildRegistryOverlay(tmp, port) {
  const overlayRoot = join(tmp, "registry-overlay", "r");
  mkdirSync(overlayRoot, { recursive: true });
  const prefix = "patterns-ui/patterns-ui/";
  for (const file of readdirSync(join(DIST_DIR, "r"))) {
    if (!file.endsWith(".json")) continue;
    const item = JSON.parse(readFileSync(join(DIST_DIR, "r", file), "utf8"));
    if (Array.isArray(item.registryDependencies)) {
      item.registryDependencies = item.registryDependencies.map((dep) =>
        dep.startsWith(prefix)
          ? `http://127.0.0.1:${port}/r/${dep.slice(prefix.length)}.json`
          : dep,
      );
    }
    writeFileSync(join(overlayRoot, file), `${JSON.stringify(item, null, 2)}\n`);
  }
}

function assertTokenPipeline(builtCss) {
  // ① 令牌定义：--status-success: oklch(...)（来自 theme preset）
  const tokenDef = builtCss.match(/--status-success:\s*oklch\([^;]*\)/);
  if (!tokenDef) {
    fail(`assertion ① failed: no "--status-success: oklch(...)" token definition in built css`);
  }
  console.log(`[smoke] ① token definition ok → ${tokenDef[0].trim()}`);

  // ② 消费 var(--status-success) 的 utility（@theme inline 生成的 .text-status-success）
  const rule = builtCss.match(/\.text-status-success\s*\{[^}]*\}/);
  if (!rule || !/color:\s*var\(--status-success\)/.test(rule[0])) {
    fail(
      `assertion ② failed: no ".text-status-success{color:var(--status-success)}" utility in built css` +
        (rule ? `\n  found rule instead: ${rule[0]}` : ""),
    );
  }
  console.log(`[smoke] ② token-consuming utility ok → ${rule[0]}`);

  // ③ 该 utility 规则内无硬编码色值
  if (/(oklch|lch|lab|rgb|hsl|#[0-9a-fA-F]{3,8})/.test(rule[0])) {
    fail(`assertion ③ failed: hardcoded color in utility rule → ${rule[0]}`);
  }
  console.log("[smoke] ③ no hardcoded color in utility rule ok");
}

/**
 * 期望的 cell 全表：从仓内词表生成物提取（单源——脚本自带副本会随 meta 演进漂移）。
 * 防线断言 = typecheck 报错输出必须含全表每一个名字（全表特征下限 ≥9）。
 */
function expectedCellNames() {
  const source = readFileSync(VOCAB_GENERATED, "utf8");
  const section = source.match(/export const CELL_NAMES = \[([\s\S]*?)\] as const;/);
  if (!section) {
    fail(`cannot extract CELL_NAMES from ${relative(ROOT, VOCAB_GENERATED)}`);
  }
  const names = [...section[1].matchAll(/"([a-z0-9-]+)"/g)].map((match) => match[1]);
  if (names.length < 9) {
    fail(`CELL_NAMES extraction sanity failed: expected ≥9 names, got ${names.length}`);
  }
  return names;
}

/**
 * M7-D 消费端 typecheck 防线（paradigm §6 验收："消费端空白项目装 core 后写错 block 名
 * typecheck 报错"）。四拍：
 *  ① pack：`pnpm --filter @patterns-ui/core pack` → tarball（file: 安装模拟装包，不触 npm）；
 *  ② 写对：引用 BlockName/CellName/PageBlockNameFor 的配置文件，`tsc --noEmit` 绿；
 *  ③ 写错：词表外名字 cell-statuz，tsc 红**且报错列出全部合法 cell 名**（断言全表在场）；
 *  ④ 还原：复绿。
 * 旋钮：SMOKE_SKIP_TYPES=1 跳过整段。
 */
function runTypecheckDefense(tmp) {
  console.log("\n[smoke] === M7-D consumer typecheck defense (vocab as shipped types) ===");

  const expectedCells = expectedCellNames();
  const configPath = join(tmp, "src", "ui-config.ts");
  const correctConfig = `import type { Archetype, BlockName, CellName } from "@patterns-ui/core/vocab";
import type { PageBlockNameFor } from "@patterns-ui/core/page";

export type SettingsHost = PageBlockNameFor<"settings">;
export const archetype: Archetype = "settings";
export const host: SettingsHost = "settings-page";
export const cells: CellName[] = ["cell-status", "cell-time"];
export const blocks: BlockName[] = ["status-badge", "data-table"];
`;
  // ③ 写错：仅 cells 行换词表外名字（cell-statuz），其余与写对版本逐字节一致
  const wrongConfig = correctConfig.replace('["cell-status", "cell-time"]', '["cell-statuz"]');

  // ① pack（--filter 须在仓根跑；--pack-destination 落 tmp 内随清理走）
  const packDir = join(tmp, "core-pack");
  mkdirSync(packDir, { recursive: true });
  run(
    "pack @patterns-ui/core",
    "pnpm",
    ["--filter", CORE_PACKAGE, "pack", "--pack-destination", packDir],
    {
      cwd: ROOT,
    },
  );
  const tarball = readdirSync(packDir).find((file) => file.endsWith(".tgz"));
  if (!tarball) {
    fail(`no *.tgz produced by pnpm pack in ${relative(tmp, packDir)}`);
  }
  const tarballPath = join(packDir, tarball);

  // 模拟装包：file: 协议安装 tarball（peers 走 registry 自动装——与真实消费者 pnpm add 同路径）
  run("install core tarball (file:)", "pnpm", ["add", `${CORE_PACKAGE}@file:${tarballPath}`], {
    cwd: tmp,
  });

  // ② 写对 → 绿
  writeFileSync(configPath, correctConfig);
  run("tsc (correct vocab names)", "pnpm", ["exec", "tsc", "--noEmit"], { cwd: tmp });
  console.log("[smoke] ② correct config typechecks green");

  // ③ 写错 → 红且报错列全表（TS2820：字面量联合在报错信息里展开全部合法值）
  writeFileSync(configPath, wrongConfig);
  const wrong = runExpectFail("tsc (cell-statuz)", "pnpm", ["exec", "tsc", "--noEmit"], {
    cwd: tmp,
  });
  const wrongOut = `${wrong.stdout ?? ""}\n${wrong.stderr ?? ""}`;
  if (!wrongOut.includes("cell-statuz")) {
    fail(`tsc error output does not even mention the bad name "cell-statuz":\n${wrongOut}`);
  }
  const missing = expectedCells.filter((name) => !wrongOut.includes(name));
  if (missing.length > 0) {
    fail(
      `tsc error output does not list the FULL cell vocab (missing ${missing.length}: ` +
        `${missing.join(", ")} — 报错信息即目录，全表必须展开):\n${wrongOut}`,
    );
  }
  console.log(
    `[smoke] ③ bad name rejected; error lists the full cell vocab (${expectedCells.length} names, ≥9 floor)`,
  );

  // ④ 还原 → 复绿
  writeFileSync(configPath, correctConfig);
  run("tsc (restored)", "pnpm", ["exec", "tsc", "--noEmit"], { cwd: tmp });
  console.log("[smoke] ④ restored config typechecks green again");
}

/**
 * M7-D skills 通道一冒烟：staging 落盘断言 + 渲染脚本直跑。
 *  - 在线路径：上方 `shadcn add skills.json` 已把 4 个文件落 <tmp>/.patterns-ui/skills/；
 *  - 离线路径（SMOKE_SKIP_ADD=1）：从仓内单源拷到相同落点（与 theme/status-badge 同手法）。
 * 随后按消费端手册同款命令渲染（node .patterns-ui/skills/render-skills.mjs），断言三宿主
 * × 三 skill 落盘、frontmatter 完好、渲染横幅在场、仓内路径已按项目形态改写、仓内同步
 * 尾注已剥离。
 */
function runSkillsChannel(tmp, offline) {
  console.log("\n[smoke] === M7-D skills channel 1 (registry:file item + embedded renderer) ===");
  const staging = join(tmp, ".patterns-ui", "skills");
  const skillNames = ["ui-page", "ui-block", "ui-theme"];

  if (offline) {
    for (const skill of skillNames) {
      mkdirSync(join(staging, skill), { recursive: true });
      cpSync(join(ROOT, ".zcode", "skills", skill, "SKILL.md"), join(staging, skill, "SKILL.md"));
    }
    cpSync(
      join(ROOT, "registry", "skills", "render-skills.mjs"),
      join(staging, "render-skills.mjs"),
    );
    console.log("[smoke] SMOKE_SKIP_ADD=1 — skills staging copied from repo single source");
  }

  // staging 断言：3 SKILL.md + 渲染脚本（~ target = 项目根的落点）
  for (const skill of skillNames) {
    if (!existsSync(join(staging, skill, "SKILL.md"))) {
      fail(`skills staging missing: .patterns-ui/skills/${skill}/SKILL.md`);
    }
  }
  if (!existsSync(join(staging, "render-skills.mjs"))) {
    fail("skills staging missing: .patterns-ui/skills/render-skills.mjs");
  }
  console.log("[smoke] staging ok — 3 SKILL.md + render-skills.mjs under .patterns-ui/skills/");

  // 渲染：消费端手册同款命令（--host all = 三宿主全渲染）
  run("render skills to hosts", process.execPath, [".patterns-ui/skills/render-skills.mjs"], {
    cwd: tmp,
  });

  // 落盘断言：三宿主 × 三 skill
  const hosts = [".claude/skills", ".zcode/skills", ".agents/skills"];
  for (const host of hosts) {
    for (const skill of skillNames) {
      if (!existsSync(join(tmp, host, skill, "SKILL.md"))) {
        fail(`rendered skill missing: ${host}/${skill}/SKILL.md`);
      }
    }
  }
  console.log("[smoke] rendered 3 hosts × 3 skills");

  // 内容断言（ui-page 为代表）：frontmatter 完好 + 横幅在场 + 仓内路径已改写 + 尾注已剥离
  const rendered = readFileSync(join(tmp, ".claude", "skills", "ui-page", "SKILL.md"), "utf8");
  const expectations = [
    ["frontmatter intact", rendered.includes("name: ui-page") && rendered.includes("description:")],
    ["render banner present", rendered.includes("渲染自 @patterns-ui skills item")],
    [
      "repo pages prefix rewritten",
      !rendered.includes("apps/demo/src/pages") && rendered.includes("src/pages"),
    ],
    ["repo sync footer stripped", !rendered.includes("三宿主目录同步")],
  ];
  for (const [label, ok] of expectations) {
    if (!ok) {
      fail(`rendered ui-page SKILL.md check failed: ${label}\n${rendered.slice(0, 400)}`);
    }
  }
  console.log("[smoke] rendered content ok (frontmatter / banner / rewrites / stripped footer)");
}

async function main() {
  for (const item of ["theme-default", "status-badge", "skills"]) {
    const file = join(DIST_DIR, "r", `${item}.json`);
    if (!existsSync(file)) {
      fail(`registry/dist/r/${item}.json missing — run "pnpm build" first`);
    }
  }

  const tmp = mkdtempSync(join(tmpdir(), "registry-smoke-"));
  let serverProc = null;
  let overlayServerProc = null;
  try {
    console.log(`[smoke] tmp project: ${tmp}`);
    mkdirSync(join(tmp, "src"), { recursive: true });
    writeFileSync(join(tmp, "package.json"), `${JSON.stringify(TMP_PACKAGE_JSON, null, 2)}\n`);
    writeFileSync(join(tmp, "tsconfig.json"), `${JSON.stringify(TMP_TSCONFIG, null, 2)}\n`);
    writeFileSync(join(tmp, "vite.config.ts"), TMP_VITE_CONFIG);
    writeFileSync(join(tmp, "index.html"), TMP_INDEX_HTML);
    writeFileSync(join(tmp, "src", "main.tsx"), TMP_MAIN_TSX);
    writeFileSync(join(tmp, "src", "index.css"), '@import "tailwindcss";\n');
    writeFileSync(
      join(tmp, "components.json"),
      `${JSON.stringify(TMP_COMPONENTS_JSON, null, 2)}\n`,
    );

    // 装依赖（pnpm-lock.yaml 的存在同时让 shadcn CLI 识别包管理器为 pnpm）
    run("install tmp deps", "pnpm", ["install"], { cwd: tmp });

    if (process.env.SMOKE_SKIP_ADD === "1") {
      // 离线模式：文件拷到与 CLI add 相同的落点，走完全相同的下游验证
      const themeCss = join(ROOT, "registry", "themes", "default.css");
      const badgeSrc = join(
        ROOT,
        "registry",
        "blocks",
        "shared",
        "status-badge",
        "status-badge.tsx",
      );
      mkdirSync(join(tmp, "src", "theme"), { recursive: true });
      mkdirSync(join(tmp, "src", "components", "blocks", "shared", "status-badge"), {
        recursive: true,
      });
      cpSync(themeCss, join(tmp, "src", "theme", "default.css"));
      cpSync(
        badgeSrc,
        join(tmp, "src", "components", "blocks", "shared", "status-badge", "status-badge.tsx"),
      );
      // 真实路径里 shadcn add 会安装 item 的 npm 依赖（status-badge 依赖 cn），离线模式补齐
      run("install cn (item npm dep)", "pnpm", ["add", "cn"], { cwd: tmp });
      console.log("[smoke] SMOKE_SKIP_ADD=1 — files copied to CLI landing spots");
    } else {
      const { proc, port } = await serveDir(DIST_DIR);
      serverProc = proc;
      console.log(`[smoke] serving ${DIST_DIR} on http://127.0.0.1:${port} (external process)`);

      // add 我们的 theme + status-badge（--yes 跳过确认；flags 已对照 shadcn add --help 核实）
      run(
        "shadcn add",
        "pnpm",
        [
          "dlx",
          SHADCN_SPEC,
          "add",
          `http://127.0.0.1:${port}/r/theme-default.json`,
          `http://127.0.0.1:${port}/r/status-badge.json`,
          "--yes",
        ],
        { cwd: tmp },
      );

      // M7-D：skills 通道一 item（registry:file + ~ target）真实 add——staging 落盘断言在
      // runSkillsChannel（~ = 项目根，官方 registry 文档 "Use ~ to refer to the root of the project"）
      run(
        "shadcn add skills item (channel 1)",
        "pnpm",
        ["dlx", SHADCN_SPEC, "add", `http://127.0.0.1:${port}/r/skills.json`, "--yes"],
        { cwd: tmp },
      );

      // M7-C2：pattern item（audit-log 组装入口，含契约卡 file + pattern 附加字段）dry-run
      // 冒烟——CLI 对整棵依赖树解析不炸、计划含组装入口。overlay 自引用改写见函数注。
      mkdirSync(join(tmp, "registry-overlay", "r"), { recursive: true });
      const overlayServe = await serveDir(join(tmp, "registry-overlay"));
      overlayServerProc = overlayServe.proc;
      try {
        buildRegistryOverlay(tmp, overlayServe.port);
        const dry = runCapture(
          "shadcn add --dry-run (pattern item)",
          "pnpm",
          [
            "dlx",
            SHADCN_SPEC,
            "add",
            `http://127.0.0.1:${overlayServe.port}/r/audit-log.json`,
            "--dry-run",
            "--yes",
          ],
          { cwd: tmp },
        );
        const dryOut = `${dry.stdout ?? ""}\n${dry.stderr ?? ""}`;
        if (!/audit-log/i.test(dryOut)) {
          fail(`pattern dry-run output does not mention the entry item "audit-log":\n${dryOut}`);
        }
        console.log("[smoke] pattern dry-run ok — CLI resolved the pattern item dependency tree");
      } finally {
        overlayServerProc.kill();
        overlayServerProc = null;
      }
    }

    // 落点发现：theme css（含 data-preset 段的 .css）与 status-badge 组件文件
    const indexCssPath = join(tmp, "src", "index.css");
    const tmpFiles = listFiles(tmp);
    const themeCssFiles = tmpFiles.filter(
      (file) =>
        file.endsWith(".css") &&
        file !== indexCssPath &&
        readFileSync(file, "utf8").includes('data-preset="default"'),
    );
    const badgeFile = tmpFiles.find((file) => file.endsWith("status-badge.tsx"));
    if (themeCssFiles.length === 0) {
      fail(
        "theme css not found after shadcn add (expected a landed *default*.css with data-preset)",
      );
    }
    if (!badgeFile) {
      fail("status-badge.tsx not found after shadcn add");
    }
    console.log(
      `[smoke] landed theme css: ${themeCssFiles.map((f) => relative(tmp, f)).join(", ")}`,
    );
    console.log(`[smoke] landed component: ${relative(tmp, badgeFile)}`);

    // index.css：@import "tailwindcss" + 落盘 theme css 的相对 import +（若有）CLI 注入的非 @import 残段
    const residue = readFileSync(indexCssPath, "utf8")
      .split("\n")
      .filter((line) => line.trim() !== "" && !line.trim().startsWith("@import"))
      .join("\n");
    const themeImports = themeCssFiles
      .sort()
      .map((file) => `@import "${relative(join(tmp, "src"), file).replaceAll("\\", "/")}";`);
    writeFileSync(
      indexCssPath,
      `${['@import "tailwindcss";', ...themeImports, residue].filter(Boolean).join("\n")}\n`,
    );

    // App.tsx：相对路径引用落盘组件（不依赖别名，落点无关）
    const badgeImport = `./${relative(join(tmp, "src"), badgeFile)
      .replaceAll("\\", "/")
      .replace(/\.tsx$/, "")}`;
    writeFileSync(
      join(tmp, "src", "App.tsx"),
      `import { StatusBadge } from "${badgeImport}";

export function App() {
  return <StatusBadge tone="success">ok</StatusBadge>;
}
`,
    );

    run("tmp vite build", "pnpm", ["build"], { cwd: tmp });

    const assetsDir = join(tmp, "dist", "assets");
    if (!existsSync(assetsDir)) {
      fail(`vite build output missing: ${assetsDir}`);
    }
    const builtCss = readdirSync(assetsDir)
      .filter((file) => file.endsWith(".css"))
      .map((file) => readFileSync(join(assetsDir, file), "utf8"))
      .join("\n");
    if (builtCss.trim() === "") {
      fail("no css assets produced by vite build");
    }
    assertTokenPipeline(builtCss);
    console.log(
      "\n[smoke] PASS — consumer pipeline verified (token → @theme inline → utility, no hardcoded color)",
    );

    // M7-D：skills 通道一（staging 断言 + 渲染脚本直跑；离线模式由仓内单源拷贝 staging）
    runSkillsChannel(tmp, process.env.SMOKE_SKIP_ADD === "1");
    console.log(
      "\n[smoke] PASS — skills channel 1 verified (registry:file staging → per-project render)",
    );

    // M7-D：消费端 typecheck 防线（同一 tmp 项目追加装 core tarball；SMOKE_SKIP_TYPES=1 跳过）
    if (process.env.SMOKE_SKIP_TYPES === "1") {
      console.log("[smoke] SMOKE_SKIP_TYPES=1 — consumer typecheck defense skipped");
    } else {
      runTypecheckDefense(tmp);
      console.log(
        "\n[smoke] PASS — consumer typecheck defense verified (pack → file: install → wrong vocab name rejected with full table → restored)",
      );
    }
  } finally {
    if (serverProc) {
      serverProc.kill();
    }
    if (overlayServerProc) {
      overlayServerProc.kill();
    }
    if (process.env.SMOKE_KEEP === "1") {
      console.log(`[smoke] SMOKE_KEEP=1 — tmp kept for inspection: ${tmp}`);
    } else {
      rmSync(tmp, { recursive: true, force: true });
      console.log(`[smoke] cleaned up ${tmp}`);
    }
  }
}

main().catch((error) => {
  console.error(`\n[smoke] aborted: ${error.message}`);
  process.exit(1);
});
