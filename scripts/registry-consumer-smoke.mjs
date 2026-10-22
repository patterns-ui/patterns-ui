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
 * 前置：仓库根已跑 `pnpm build`（registry/dist 由 registry:build 产出）。
 * 注意：shadcn CLI 在本机有网络挂起史（CI 正常）——本脚本各步骤带超时，挂起即失败退出；
 * CI 是权威判官。
 */
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DIST_DIR = join(ROOT, "registry", "dist");
// 单步超时：CI 冷缓存下 pnpm dlx shadcn 首次拉包可能偏慢；真挂起（远超此值）则失败退出而非无限等
const STEP_TIMEOUT_MS = 8 * 60_000;

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

/** ~20 行静态 server：托管 registry/dist（content-type application/json） */
function serveRegistryDist() {
  const server = createServer((req, res) => {
    const pathname = decodeURIComponent(new URL(req.url ?? "/", "http://127.0.0.1").pathname);
    const filePath = join(DIST_DIR, pathname.replace(/^\/+/, ""));
    if (!filePath.startsWith(DIST_DIR) || !existsSync(filePath) || !statSync(filePath).isFile()) {
      res.writeHead(404, { "content-type": "text/plain" });
      res.end(`not found: ${pathname}`);
      return;
    }
    res.writeHead(200, { "content-type": "application/json" });
    res.end(readFileSync(filePath));
  });
  return new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(0, "127.0.0.1", () => {
      resolvePromise({ server, port: server.address().port });
    });
  });
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

async function main() {
  for (const item of ["theme-default", "status-badge"]) {
    const file = join(DIST_DIR, "r", `${item}.json`);
    if (!existsSync(file)) {
      fail(`registry/dist/r/${item}.json missing — run "pnpm build" first`);
    }
  }

  const tmp = mkdtempSync(join(tmpdir(), "registry-smoke-"));
  let server = null;
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

    const { server: httpServer, port } = await serveRegistryDist();
    server = httpServer;
    console.log(`[smoke] serving ${DIST_DIR} on http://127.0.0.1:${port}`);

    // add 我们的 theme + status-badge（--yes 跳过确认；flags 已对照 shadcn add --help 核实）
    run(
      "shadcn add",
      "pnpm",
      [
        "dlx",
        "shadcn@latest",
        "add",
        `http://127.0.0.1:${port}/r/theme-default.json`,
        `http://127.0.0.1:${port}/r/status-badge.json`,
        "--yes",
      ],
      { cwd: tmp },
    );

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
  } finally {
    if (server) {
      server.close();
    }
    rmSync(tmp, { recursive: true, force: true });
    console.log(`[smoke] cleaned up ${tmp}`);
  }
}

main().catch((error) => {
  console.error(`\n[smoke] aborted: ${error.message}`);
  process.exit(1);
});
