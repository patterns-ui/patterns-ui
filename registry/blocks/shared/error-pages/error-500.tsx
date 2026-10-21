import { ServerCrash } from "lucide-react";
import type { ReactNode } from "react";

export interface ErrorPageProps {
  message?: ReactNode;
  action?: ReactNode;
}

/** 500 页：服务端错误 */
export function Error500({ message = "服务器开小差了，请稍后重试。", action }: ErrorPageProps) {
  return (
    <main className="bg-background flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-primary text-[64px] leading-none font-semibold tabular-nums">500</p>
      <div className="bg-status-danger-bg text-status-danger flex size-11 items-center justify-center rounded-full">
        <ServerCrash className="size-5" />
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px] font-semibold tracking-tight">服务端错误</h1>
        <p className="text-muted-foreground max-w-md text-[13px]">{message}</p>
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </main>
  );
}
