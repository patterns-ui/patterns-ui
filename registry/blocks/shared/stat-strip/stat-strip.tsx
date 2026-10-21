import { cn } from "cn";
import { TrendingDown, TrendingUp } from "lucide-react";

export interface StatItem {
  label: string;
  value: React.ReactNode;
  /** 子说明（如 "2 待处理变更"） */
  sub?: string;
  trend?: "up" | "down";
  /** 趋势/数值的警示态（danger 走 --status-danger） */
  danger?: boolean;
}

export interface StatStripProps {
  stats: StatItem[];
  className?: string;
}

/** 统计卡行：微标签 + 30px tabular-nums 大数 + 趋势/子说明（architecture.md §8 视觉基线） */
export function StatStrip({ stats, className }: StatStripProps) {
  return (
    <div
      className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-4", className)}
      data-slot="stat-strip"
    >
      {stats.map((stat) => (
        <div key={stat.label} className="flex flex-col gap-1 rounded-xl border px-5 py-4">
          <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
            {stat.label}
          </p>
          <div className="flex items-baseline gap-2">
            <span
              className={cn(
                "text-[30px] leading-none font-semibold tabular-nums",
                stat.danger && "text-status-danger",
              )}
            >
              {stat.value}
            </span>
            {stat.trend ? (
              <span
                className={cn(
                  "inline-flex items-center gap-0.5 text-xs font-medium",
                  stat.trend === "up" ? "text-status-success" : "text-status-danger",
                )}
              >
                {stat.trend === "up" ? (
                  <TrendingUp className="size-3" />
                ) : (
                  <TrendingDown className="size-3" />
                )}
              </span>
            ) : null}
          </div>
          {stat.sub ? <p className="text-muted-foreground text-[13px]">{stat.sub}</p> : null}
        </div>
      ))}
    </div>
  );
}
