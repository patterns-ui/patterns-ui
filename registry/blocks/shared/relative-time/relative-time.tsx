import {
  type DateTimePrefs,
  formatAbsolute,
  formatRelative,
  useDateTimePrefs,
  useNow,
} from "@fleetly/ui-component-core/datetime";
import { cn } from "cn";

function toIsoString(value: string | number | Date): string | undefined {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

export interface RelativeTimeProps {
  value: string | number | Date;
  /** 活渲染间隔，默认 30s；传 0 关闭（渲染一次） */
  intervalMs?: number;
  className?: string;
}

/**
 * 相对时间（useNow 活渲染）：正文相对格式，title/dateTime 携带时区感知的绝对格式。
 */
export function RelativeTime({ value, intervalMs = 30_000, className }: RelativeTimeProps) {
  const { prefs } = useDateTimePrefs();
  const now = useNow(intervalMs);
  const absolutePrefs: DateTimePrefs = {
    ...prefs,
    absolutePattern: prefs.absolutePattern ?? "full",
  };

  const relative = formatRelative(value, now);
  const absolute = formatAbsolute(value, absolutePrefs);
  const iso = toIsoString(value);

  return (
    <time
      dateTime={iso}
      title={absolute}
      className={cn("text-muted-foreground text-[13px] tabular-nums", className)}
    >
      {relative}
    </time>
  );
}
