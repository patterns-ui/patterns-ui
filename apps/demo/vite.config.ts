import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { mockApiPlugin } from "./src/mocks/plugin";

/**
 * dev（vite serve）把 `@patterns-ui/core` 别名到 workspace 源码：干净 clone 后
 * 仅 `pnpm install && pnpm dev` 即起（无需先构建 core dist——dist 是 gitignore 的）。
 * build/preview 仍消费 dist（demo 对包出口的消费形态与真实宿主一致；CI/本地先 build）。
 */
const coreSrc = fileURLToPath(new URL("../../packages/core/src", import.meta.url));

export default defineConfig(({ command }) => ({
  plugins: [
    // mock API：dev 中间件拦截 /api/*（内存存储 + 模拟延迟）
    mockApiPlugin(),
    // 文件路由：dev/build 前生成 src/routeTree.gen.ts（已 gitignore）
    tanstackRouter({
      target: "react",
      autoCodeSplitting: true,
    }),
    react(),
    tailwindcss(),
  ],
  resolve: {
    // 顺序敏感：更具体的 blocks alias 必须在 "@" 之前（architecture.md §5）
    alias: [
      ...(command === "serve" ? [{ find: "@patterns-ui/core", replacement: coreSrc }] : []),
      {
        find: "@/components/blocks",
        replacement: fileURLToPath(new URL("../../registry/blocks", import.meta.url)),
      },
      {
        find: "@",
        replacement: fileURLToPath(new URL("./src", import.meta.url)),
      },
    ],
  },
  // preview（pnpm review = build + preview）钉死端口：CI/本地冒烟 curl 探活用
  preview: { port: 4173, strictPort: true },
}));
