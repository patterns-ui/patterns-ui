import { SearchX } from "lucide-react";
import type { ReactNode } from "react";

export interface ErrorPageProps {
  message?: ReactNode;
  action?: ReactNode;
}

/** 404 页：页面不存在（也用作 router notFoundComponent） */
export function Error404({
  message = "页面不存在或已被移动。检查地址是否输入正确。",
  action,
}: ErrorPageProps) {
  return (
    <main className="bg-background flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-primary text-[64px] leading-none font-semibold tabular-nums">404</p>
      <div className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-full">
        <SearchX className="size-5" />
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px] font-semibold tracking-tight">找不到页面</h1>
        <p className="text-muted-foreground max-w-md text-[13px]">{message}</p>
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </main>
  );
}
