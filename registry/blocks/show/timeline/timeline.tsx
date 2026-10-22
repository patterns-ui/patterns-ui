/**
 * timeline —— 事件时间线（三态：done/running/waiting；docs/blocks.md show/）。
 */

import {
  formatAbsolute,
  formatRelative,
  useDateTimePrefs,
} from "@fleetly/patterns-ui-core/datetime";
import { cn } from "cn";
import { Check, Loader2 } from "lucide-react";
import type { ReactNode } from "react";

export type TimelineItemState = "done" | "running" | "waiting" | "failed";

export interface TimelineItem {
  title: ReactNode;
  /** ISO 时间（缺省为纯步骤节点） */
  at?: string | number | Date;
  state: TimelineItemState;
  /** 附加说明行 */
  detail?: ReactNode;
  /** 右侧动作（如重试） */
  actions?: ReactNode;
}

const dotClass: Record<TimelineItemState, string> = {
  done: "border-status-success/50 bg-status-success-bg text-status-success",
  running: "border-primary/50 bg-primary/10 text-primary",
  waiting: "text-muted-foreground border-border bg-muted",
  failed: "border-status-danger/50 bg-status-danger-bg text-status-danger",
};

const lineClass: Record<TimelineItemState, string> = {
  done: "bg-status-success/40",
  running: "bg-primary/40",
  waiting: "bg-border",
  failed: "bg-status-danger/40",
};

/** 垂直时间线：节点三态（done ✓ / running 转圈 / waiting 空点；failed 复用 danger 语义）。 */
export function Timeline({ items, className }: { items: TimelineItem[]; className?: string }) {
  const { prefs } = useDateTimePrefs();
  return (
    <ol className={cn("flex flex-col", className)}>
      {items.map((item, index) => {
        const isLast = index === items.length - 1;
        return (
          <li key={index} className="grid grid-cols-[24px_1fr] gap-3">
            {/* 节点 + 连线 */}
            <div className="flex flex-col items-center">
              <span
                aria-hidden="true"
                className={cn(
                  "z-10 flex size-6 shrink-0 items-center justify-center rounded-full border",
                  dotClass[item.state],
                )}
              >
                {item.state === "done" ? (
                  <Check className="size-3.5" />
                ) : item.state === "running" ? (
                  <Loader2 className="size-3 animate-spin" />
                ) : null}
              </span>
              {!isLast ? (
                <span aria-hidden="true" className={cn("w-px flex-1", lineClass[item.state])} />
              ) : null}
            </div>
            {/* 内容 */}
            <div className={cn("flex flex-col gap-1 pb-6", isLast && "pb-0")}>
              <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span
                  className={cn(
                    "text-sm",
                    item.state === "waiting" ? "text-muted-foreground" : "font-medium",
                  )}
                >
                  {item.title}
                </span>
                {item.at !== undefined ? (
                  <time
                    className="text-muted-foreground text-xs"
                    dateTime={new Date(item.at).toISOString()}
                    title={formatAbsolute(item.at, prefs)}
                  >
                    {formatRelative(item.at)}
                  </time>
                ) : null}
              </div>
              {item.detail ? (
                <div className="text-muted-foreground text-sm">{item.detail}</div>
              ) : null}
              {item.actions ? (
                <div className="mt-1 flex items-center gap-2">{item.actions}</div>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
