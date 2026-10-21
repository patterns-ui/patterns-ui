import { Lock } from "lucide-react";
import type { ReactNode } from "react";

export interface ErrorPageProps {
  message?: ReactNode;
  /** 覆盖默认动作区（默认为空，由宿主传返回链接/按钮） */
  action?: ReactNode;
}

/** 403 页：已登录但无权限 */
export function Error403({
  message = "你的账号没有访问此页面的权限。如需开通请联系管理员。",
  action,
}: ErrorPageProps) {
  return (
    <main className="bg-background flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-primary text-[64px] leading-none font-semibold tabular-nums">403</p>
      <div className="bg-status-warning-bg text-status-warning flex size-11 items-center justify-center rounded-full">
        <Lock className="size-5" />
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px] font-semibold tracking-tight">没有权限</h1>
        <p className="text-muted-foreground max-w-md text-[13px]">{message}</p>
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </main>
  );
}
