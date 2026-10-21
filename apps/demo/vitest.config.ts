import { defineConfig } from "vitest/config";

// 守卫测试为 node 环境纯字符串扫描（不渲染组件），独立于 vite.config.ts 的插件链
// （mock 中间件 / 文件路由生成）——避免测试启动时的插件扫描噪音。
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "e2e/**/*.test.ts"],
  },
});
