/**
 * API Keys 页配置（M7-A3 批1）：defineResource def + 页面文案/表单 schema —— 纯配置（0 JSX）。
 *
 * api-key 模式预设（列表 + scope + 一次性 reveal）M8 波1 才建 preset block；当前渲染
 * 出口 components/pages/api-keys.tsx（自定义密钥卡片列表 + form-dialog + secret-reveal），
 * 结构与文案单源在本配置。
 */
import { defineResource } from "@patterns-ui/core/resource";
import { z } from "zod";
import { apiKeysResource } from "@/resources";

export const apiKeysDef = defineResource({
  name: "api-keys",
  label: "API Keys",
  client: apiKeysResource.client,
  columns: [],
});

export const API_KEYS_COPY = {
  description: "用于 CI 与集成的访问密钥。密钥仅在创建时展示一次，吊销后立即失效。",
  empty: { title: "还没有 API Key", description: "创建第一个密钥用于 CI 或集成调用。" },
  createLabel: "创建 Key",
  createTitle: "创建 API Key",
  createDescription: "名称用于识别用途；密钥仅在创建后展示一次。",
  danger: {
    title: "吊销 Key",
    description: "高危操作：吊销后使用该 Key 的调用将立即 401。",
    confirmLabel: "吊销",
  },
  revokedToast: "API Key 已吊销",
  revealTitle: (name: string) => `API Key 已创建：${name}`,
  revealDescription: "以下密钥仅显示一次。关闭后无法再次查看（服务端不存储明文）。",
  revealSavedToast: "密钥已保存确认",
} as const;

/** 有效期档位（封闭选项表） */
export const EXPIRY_OPTIONS = [
  { value: "30d", label: "30 天" },
  { value: "90d", label: "90 天" },
  { value: "180d", label: "180 天" },
  { value: "never", label: "永不过期" },
] as const;

/** 创建表单 schema（zod v4；与服务端 mock 约定一致） */
export const createSchema = z.object({
  name: z.string().trim().min(3, "名称至少 3 个字符"),
  expiresIn: z.enum(["30d", "90d", "180d", "never"]),
});
