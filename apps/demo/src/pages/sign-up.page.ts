/**
 * 注册页配置（M7-A3 批3）：definePage("auth-flow") —— 纯配置（0 JSX）。
 * demo 无注册端点：提交为模拟延迟（适配器），成功态由 block 内部呈现。
 */
import { definePage } from "@patterns-ui/core/page";

export const signUpPage = definePage("auth-flow", {
  host: "sign-up-page",
  brand: { name: "Fleetly Console", logoText: "F" },
  footer: {
    note: "已有账号？",
    links: [{ label: "直接登录", to: "/auth/sign-in", kind: "primary" }],
  },
});

/** 模拟提交适配器（demo：无端点，延迟后进入成功态） */
export function makeFakeSubmit(delayMs: number): () => Promise<void> {
  return () =>
    new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
}
