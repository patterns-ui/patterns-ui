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
  format: ["esm"],
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
    "zod",
    "next-themes",
  ],
});
