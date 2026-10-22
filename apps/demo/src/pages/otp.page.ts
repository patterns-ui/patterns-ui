/**
 * OTP 验证码页配置（M7-A3 批3）：definePage("auth-flow") —— 纯配置（0 JSX）。
 * demo：任意 6 位验证码均通过（适配器），完成后跳首页。
 */
import { definePage } from "@patterns-ui/core/page";

export const otpPage = definePage("auth-flow", {
  host: "otp-page",
  brand: { name: "Fleetly Console", logoText: "F" },
  footer: {
    links: [{ label: "使用其它方式登录", to: "/auth/sign-in", kind: "muted" }],
  },
});

/** OTP 提交适配器（demo：任意验证码通过 → 跳首页） */
export function makeOtpSubmit(deps: {
  navigate: (to: string) => Promise<unknown>;
}): (code: string) => Promise<void> {
  return async () => {
    await new Promise((resolve) => {
      setTimeout(resolve, 500);
    });
    await deps.navigate("/");
  };
}
