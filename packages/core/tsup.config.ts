import { existsSync } from "node:fs";
import { defineConfig } from "tsup";

const modules = [
  "data",
  "list",
  "filters",
  "form",
  "reference",
  "mutation",
  "tenant",
  "auth",
  "router",
  "task",
  "inline",
  "datetime",
  "resource",
  "theme",
  "storage",
] as const;

/** 模块入口同时支持 index.ts（纯逻辑）与 index.tsx（含 JSX 的 Provider） */
function moduleEntry(module: string): string {
  return existsSync(`src/${module}/index.tsx`)
    ? `src/${module}/index.tsx`
    : `src/${module}/index.ts`;
}

export default defineConfig({
  entry: {
    index: "src/index.ts",
    ...Object.fromEntries(modules.map((m) => [`${m}/index`, moduleEntry(m)])),
  },
  // 双格式：package.json "type": "module" 下 esm → .js、cjs → .cjs，
  // exports 每个出口的 import/require 条件分别指向（attw node16-cjs 必需，publint 亦检查）
  format: ["esm", "cjs"],
  dts: true,
  clean: true,
  sourcemap: true,
  target: "es2022",
  external: [
    "react",
    "react/jsx-runtime",
    "react-dom",
    "@tanstack/react-query",
    "@tanstack/react-router",
    // react-query 的传递依赖（未声明会误内联其 CJS 版本 → 浏览器 ESM 里出现 __require("react")）
    "use-sync-external-store",
    "use-sync-external-store/shim/with-selector",
    "zod",
    "next-themes",
  ],
});
