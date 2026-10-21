import { cn } from "cn";
import type { StatusBadgeTone } from "@/components/blocks/shared/status-badge/status-badge";
import { StatusBadge } from "@/components/blocks/shared/status-badge/status-badge";

export interface CellStatusProps {
  value: string | undefined;
  /** 值 → tone 映射，如 { running: 'success', failed: 'danger' }；未命中回落 neutral */
  map?: Record<string, StatusBadgeTone>;
  /** 活动态（呼吸点），如 running */
  pulseFor?: string[];
  className?: string;
}

const DEFAULT_MAP: Record<string, StatusBadgeTone> = {
  running: "success",
  active: "success",
  succeeded: "success",
  healthy: "success",
  degraded: "warning",
  pending: "warning",
  queued: "warning",
  warning: "warning",
  failed: "danger",
  error: "danger",
  stopped: "neutral",
  cancelled: "neutral",
  draft: "neutral",
};

/** 状态单元格：StatusBadge 别名映射（未登记的值回落 neutral，不做硬编码色） */
export function CellStatus({ value, map, pulseFor, className }: CellStatusProps) {
  if (value === undefined || value === null || value === "") {
    return <span className={cn("text-muted-foreground text-[13px]", className)}>—</span>;
  }
  const tone = (map ?? DEFAULT_MAP)[value] ?? "neutral";
  return (
    <span className={className}>
      <StatusBadge tone={tone} pulse={pulseFor?.includes(value)}>
        {value}
      </StatusBadge>
    </span>
  );
}
