/**
 * services 新建页配置（M7-A3 批1）：spec —— 纯配置（0 JSX）。
 *
 * 结构与文案在此；渲染出口 components/pages/service-form.tsx（FormPage 宿主 +
 * useResourceForm + typed-form-field 接线；草稿自动保存）。
 */
import type { ServiceFormSpec } from "@/components/pages/service-form";

export const servicesNewSpec: ServiceFormSpec = {
  mode: "new",
  title: "新建服务",
  description: "创建一个服务并选择运行环境；草稿会自动保存在本地。",
  backTo: "/t/:tenantId/services",
  backLabel: "Services",
  submitLabel: "创建服务",
  pendingLabel: "创建中…",
  sections: [
    { id: "basics", title: "基本信息", description: "名称与环境必填；负责人可就地新建。" },
    { id: "spec", title: "副本与规格", description: "运行规格与区域。" },
    { id: "advanced", title: "高级", description: "标签 / 环境变量 / JSON 配置 / 附件。" },
  ],
  createdToast: (name) => `服务 ${name} 已创建`,
};
