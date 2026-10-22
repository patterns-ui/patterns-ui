/**
 * services 详情页配置（M7-A3 批1）：ResourceDetailView 声明化 spec —— 纯配置（0 JSX）。
 *
 * 结构（hero/状态/相邻跳转/hero 动作/tabs/custom 登记名/对话框登记表）全部在此；
 * 运行时值（id、inlineSave 保存接线）由路由胶水注入。custom tab 与对话框的实现
 * 组件在 components/service-detail-tabs.tsx（登记制：本表键 ↔ 实现组件）。
 */
import { defineResourceDetailPage } from "@/components/blocks/show/resource-detail-view/resource-detail-view";
import {
  ServiceDangerTab,
  ServiceDeployDialog,
  ServiceDeploymentsTab,
} from "@/components/service-detail-tabs";
import { servicesDef } from "./services-list.page";

export const servicesDetailSpec = defineResourceDetailPage({
  def: servicesDef,
  statusField: "status",
  statusMap: { running: "success", degraded: "warning", stopped: "neutral" },
  statusPulseFor: ["running"],
  hero: { icon: "boxes", subtitleTemplate: "{id} · v{version}", badgeFields: ["env"] },
  heroActions: [
    {
      id: "edit",
      label: "编辑",
      kind: "link",
      to: "/t/:tenantId/services/:id/edit",
      variant: "outline",
      icon: "pencil",
    },
    { id: "deploy", label: "部署", kind: "open-dialog", dialog: "service-deploy", icon: "rocket" },
  ],
  pager: { toTemplate: "/t/:tenantId/services/:id" },
  customTabs: {
    "service-deployments": ServiceDeploymentsTab,
    "service-danger": ServiceDangerTab,
  },
  dialogs: { "service-deploy": ServiceDeployDialog },
});
