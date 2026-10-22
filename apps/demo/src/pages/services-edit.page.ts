/**
 * services 编辑页配置（M7-A3 批1）：spec —— 纯配置（0 JSX）。
 *
 * 结构与文案在此；渲染出口 components/pages/service-form.tsx（FormPage 宿主 +
 * useResourceForm + typed-form-field 接线）；变更摘要与 409 演示为编辑页专属开关。
 */
import type { ServiceFormSpec } from "@/components/pages/service-form";

export const servicesEditSpec: ServiceFormSpec = {
  mode: "edit",
  title: "编辑服务",
  description: "修改服务的基本信息、规格与高级配置。",
  backTo: "/t/:tenantId/services/:id",
  submitLabel: "保存修改",
  pendingLabel: "保存中…",
  sections: [
    { id: "basics", title: "基本信息", description: "名称 / 环境 / 负责人。" },
    { id: "spec", title: "副本与规格", description: "副本 / 区域 / 维护窗口。" },
    { id: "advanced", title: "高级", description: "标签 / 环境变量 / JSON 配置 / 附件。" },
  ],
  diffAside: true,
  conflictDemo: true,
};
