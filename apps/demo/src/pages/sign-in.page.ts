/**
 * 登录页配置（M7-A3 批3）：definePage("auth-flow") —— 纯配置（0 JSX）。
 * 运行时接线（login、next 回跳）由路由胶水注入 PageRenderer data。
 */
import { definePage } from "@patterns-ui/core/page";

export const signInPage = definePage("auth-flow", {
  host: "sign-in-page",
  brand: { name: "Fleetly Console", logoText: "F" },
  description: "测试账号：demo@fleetly.dev，密码任意",
  footer: {
    links: [
      { label: "忘记密码？", to: "/auth/forgot", kind: "muted" },
      { label: "注册账号", to: "/auth/sign-up", kind: "primary" },
    ],
  },
});

/** 登录提交适配器：login 成功后回跳 next（缺省 /） */
export function makeSignInSubmit(deps: {
  login: (credentials: { email: string; password: string }) => Promise<unknown>;
  navigate: (to: string) => Promise<unknown>;
  next?: string;
}): (credentials: { email: string; password: string }) => Promise<void> {
  return async (credentials) => {
    await deps.login(credentials);
    await deps.navigate(deps.next ?? "/");
  };
}
