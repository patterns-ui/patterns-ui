/**
 * Deployments 页配置（M7-A3 批1）：空态指针页（部署从服务详情触发；本页无独立
 * 列表端点——deployments 是 services 子资源）—— 纯配置（0 JSX）。
 */
export const DEPLOYMENTS_COPY = {
  title: "Deployments",
  description: "服务的发布记录与进度。",
  empty: {
    title: "还没有部署记录",
    description: "部署从服务详情触发 —— 打开一个服务，点击「部署」开始第一次发布。",
    actionLabel: "打开 Services",
  },
} as const;
