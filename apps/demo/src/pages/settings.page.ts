/**
 * Settings 页配置（M7-A3 批2）：definePage("settings") —— 纯配置（0 JSX）。
 *
 * sections[] 显式声明（与内置缺省等价的五节；org 节在 org 数据未就绪时隐藏——
 * 与缺省行为同规则）；数据与回调（org/profile/保存适配器）由路由胶水经
 * PageRenderer data 注入（模式页逻辑以类型化适配器引用，禁 JSX/无类型闭包）。
 */
import { definePage } from "@patterns-ui/core/page";

export const settingsPageConfig = definePage("settings", {
  host: "settings-page",
  sections: [
    {
      id: "org",
      label: "组织",
      description: "租户名称与标识。",
      icon: "building-2",
      content: { preset: "org" },
    },
    {
      id: "profile",
      label: "个人",
      description: "显示名、邮箱与时区。",
      icon: "user-cog",
      content: { preset: "profile" },
    },
    {
      id: "security",
      label: "安全",
      description: "修改登录密码。",
      icon: "key-round",
      content: { preset: "security" },
    },
    {
      id: "sessions",
      label: "会话",
      description: "活跃会话管理（占位）",
      content: { preset: "sessions" },
    },
    {
      id: "appearance",
      label: "外观",
      description: "主题与样式预设，即时生效。",
      icon: "palette",
      content: { preset: "appearance" },
    },
  ],
});
