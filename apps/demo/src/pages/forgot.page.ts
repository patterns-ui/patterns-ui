/**
 * 忘记密码页配置（M7-A3 批3）：definePage("auth-flow") —— 纯配置（0 JSX）。
 * demo 无真实邮件端点：提交为模拟延迟，成功态由 block 内部呈现。
 */
import { definePage } from "@patterns-ui/core/page";

export const forgotPasswordPage = definePage("auth-flow", {
  host: "forgot-password-page",
  brand: { name: "Fleetly Console", logoText: "F" },
  footer: {
    links: [{ label: "返回登录", to: "/auth/sign-in", kind: "muted" }],
  },
});

/** 模拟提交适配器（demo：无端点，延迟后进入发送成功态） */
export function makeFakeSubmit(delayMs: number): () => Promise<void> {
  return () =>
    new Promise((resolve) => {
      setTimeout(resolve, delayMs);
    });
}
