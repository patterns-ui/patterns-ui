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

export default defineConfig({
  entry: {
    index: "src/index.ts",
    ...Object.fromEntries(modules.map((m) => [`${m}/index`, `src/${m}/index.ts`])),
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
