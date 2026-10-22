/**
 * 租户概览页配置（M7-A3 批2）：definePage("overview") —— 纯配置（0 JSX）。
 * statCards 声明四卡（值来自 services facets，运行时经 data 注入）；
 * dashboard-page 宿主 M8 波1 落地后本页收敛为工厂装配。摘要文案片段单源在此。
 */
import { definePage } from "@patterns-ui/core/page";

export const overviewPageConfig = definePage("overview", {
  host: "stat-strip",
  title: "Overview",
  statCards: [
    { id: "services", label: "Services" },
    { id: "running", label: "Running" },
    { id: "degraded", label: "Degraded" },
    { id: "stopped", label: "Stopped" },
  ],
});

/** overview 摘要文案（条件分支的静态片段；运行时数据在渲染出口拼装） */
export const OVERVIEW_COPY = {
  eyebrow: "Overview",
  defaultDescription: "租户概览",
  loadingTitle: "加载中…",
  summaryTitle: "状态摘要",
  summaryEmpty: "还没有服务 —— 创建第一个服务开始部署。",
  summaryDegradedPrefix: (total: number, degraded: number) =>
    `${total} 个服务中有 ${degraded} 个处于降级状态，建议到`,
  summaryDegradedSuffix: "排查。",
  summaryHealthyPrefix: (total: number) => `全部 ${total} 个服务运行正常。最近变更见`,
  summaryHealthySuffix: "。",
  servicesLink: "Services",
  auditLink: "Audit",
  openServices: "打开 Services",
  openAudit: "打开 Audit",
} as const;
