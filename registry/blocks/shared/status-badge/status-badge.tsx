import { cn } from "cn";
import type { ReactNode } from "react";

export type StatusBadgeTone = "success" | "warning" | "danger" | "info" | "neutral";

const toneClasses = {
  success: "border-status-success/25 bg-status-success-bg text-status-success",
  warning: "border-status-warning/25 bg-status-warning-bg text-status-warning",
  danger: "border-status-danger/25 bg-status-danger-bg text-status-danger",
  info: "border-status-info/25 bg-status-info-bg text-status-info",
  neutral: "border-border bg-status-neutral-bg text-status-neutral",
} as const satisfies Record<StatusBadgeTone, string>;

export interface StatusBadgeProps {
  /** 语义 tone，映射到宿主项目的 `--status-*` 设计令牌（见 architecture.md §8） */
  tone: StatusBadgeTone;
  /** 状态点呼吸动画（用于 running / reconciling 等活动态） */
  pulse?: boolean;
  children: ReactNode;
}

/**
 * 语义状态徽章：微标签规格（12px 大写 + 字距），前景/软底双令牌，
 * 颜色全部来自 `--status-<tone>` / `--status-<tone>-bg`，无硬编码色值。
 */
export function StatusBadge({ tone, pulse = false, children }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5",
        "text-xs font-medium tracking-wider uppercase",
        toneClasses[tone],
      )}
    >
      <span
        aria-hidden="true"
        className={cn("size-1.5 rounded-full bg-current", pulse && "animate-pulse")}
      />
      {children}
    </span>
  );
}
