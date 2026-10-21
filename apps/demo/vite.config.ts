import { fileURLToPath, URL } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import { tanstackRouter } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { mockApiPlugin } from "./src/mocks/plugin";

export default defineConfig({
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
});
