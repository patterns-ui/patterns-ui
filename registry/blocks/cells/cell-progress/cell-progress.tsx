import { cn } from "cn";
import type { StatusBadgeTone } from "@/components/blocks/shared/status-badge/status-badge";

export interface CellProgressProps {
  /** 0-100 百分比；或 {current,total} 自动换算 */
  value: number | { current: number; total: number } | undefined;
  /** 状态色（progress 前景色走 --status-* 令牌；缺省用 primary） */
  state?: StatusBadgeTone;
  /** 是否显示百分比数字（默认 true） */
  showValue?: boolean;
  className?: string;
}

const stateFill: Record<StatusBadgeTone, string> = {
  success: "[&::-webkit-progress-value]:bg-status-success [&::-moz-progress-bar]:bg-status-success",
  warning: "[&::-webkit-progress-value]:bg-status-warning [&::-moz-progress-bar]:bg-status-warning",
  danger: "[&::-webkit-progress-value]:bg-status-danger [&::-moz-progress-bar]:bg-status-danger",
  info: "[&::-webkit-progress-value]:bg-status-info [&::-moz-progress-bar]:bg-status-info",
  neutral:
    "[&::-webkit-progress-value]:bg-muted-foreground [&::-moz-progress-bar]:bg-muted-foreground",
};

/** 进度单元格：语义 <progress>（状态色映射 --status-*）+ 百分比；支持 {current,total} 形态 */
export function CellProgress({ value, state, showValue = true, className }: CellProgressProps) {
  let percent: number | undefined;
  if (typeof value === "number") {
    percent = value;
  } else if (value && typeof value === "object") {
    percent = value.total > 0 ? Math.round((value.current / value.total) * 100) : 0;
  }
  if (percent === undefined || Number.isNaN(percent)) {
    return <span className={cn("text-muted-foreground text-[13px]", className)}>—</span>;
  }
  const clamped = Math.max(0, Math.min(100, percent));
  return (
    <span className={cn("inline-flex items-center gap-2", className)} data-slot="cell-progress">
      <progress
        value={clamped}
        max={100}
        aria-label={`${clamped}%`}
        className={cn(
          "bg-muted h-1.5 w-24 overflow-hidden rounded-full",
          "[&::-webkit-progress-bar]:bg-transparent [&::-webkit-progress-value]:rounded-full [&::-moz-progress-bar]:rounded-full",
          "[&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary",
          state ? stateFill[state] : undefined,
        )}
      />
      {showValue ? (
        <span className="text-muted-foreground tabular-nums text-xs">{clamped}%</span>
      ) : null}
    </span>
  );
}
