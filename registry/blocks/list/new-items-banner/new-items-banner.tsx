import type { NewItemsSignal } from "@patterns-ui/core/task";
import { cn } from "cn";
import { ArrowUpToLine } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface NewItemsBannerProps {
  signal: NewItemsSignal;
  /** 确认按钮文案，默认「查看新数据」 */
  actionLabel?: string;
  className?: string;
}

/** 「有 N 条新数据」提示条：不自动插行（防跳动），确认后 refetch 进入表格 */
export function NewItemsBanner({
  signal,
  actionLabel = "查看新数据",
  className,
}: NewItemsBannerProps) {
  if (signal.newCount <= 0) return null;
  return (
    <div
      className={cn(
        "border-primary/25 bg-primary/5 text-primary flex items-center justify-between gap-3 rounded-lg border px-3 py-2",
        className,
      )}
      data-slot="new-items-banner"
      role="status"
    >
      <span className="flex items-center gap-2 text-[13px]">
        <ArrowUpToLine className="size-3.5" />有{" "}
        <strong className="tabular-nums">{signal.newCount}</strong> 条新数据
      </span>
      <Button size="sm" variant="outline" onClick={signal.acknowledge}>
        {actionLabel}
      </Button>
    </div>
  );
}
