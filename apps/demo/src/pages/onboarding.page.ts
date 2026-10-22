/**
 * onboarding 页配置（M7-A3 批2）：definePage("wizard")，宿主 = onboarding 预设
 * —— 纯配置（0 JSX）。首登向导步骤声明（欢迎 → 创建首个资源 → 邀请成员 → 完成跳转，
 * 步骤间数据保留由 block 内部流承载）；资源创建/邀请/完成适配器由路由胶水注入。
 */
import { definePage } from "@patterns-ui/core/page";

export const onboardingPageConfig = definePage("wizard", {
  host: "onboarding",
  title: "Onboarding",
  steps: [
    { id: "welcome", title: "欢迎" },
    { id: "create", title: "创建首个资源" },
    { id: "invite", title: "邀请成员" },
    { id: "done", title: "完成" },
  ],
});

/** onboarding 环境选项（与 services 的 env 档一致） */
export const ONBOARDING_ENV_OPTIONS = [
  { value: "rep", label: "rep" },
  { value: "staging", label: "staging" },
  { value: "prod", label: "prod" },
] as const;

/** onboarding 角色选项 */
export const ONBOARDING_ROLE_OPTIONS = [
  { value: "admin", label: "Admin" },
  { value: "member", label: "Member" },
  { value: "viewer", label: "Viewer" },
] as const;
