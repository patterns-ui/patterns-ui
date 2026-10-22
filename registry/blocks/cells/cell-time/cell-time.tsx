import {
  type DateTimePrefs,
  formatAbsolute,
  formatRelative,
  useDateTimePrefs,
  useNow,
} from "@fleetly/patterns-ui-core/datetime";
import { cn } from "cn";
import { useEffect, useState } from "react";

const MODE_KEY = "fc:cell-time-mode";

type CellTimeMode = "relative" | "absolute";

function readMode(): CellTimeMode {
  try {
    const raw = globalThis.localStorage?.getItem(MODE_KEY);
    return raw === "absolute" ? "absolute" : "relative";
  } catch {
    return "relative";
  }
}

/** mode 的读取收敛（首次 render 用 relative，effect 内按偏好校正；SSR 安全） */
function useMode(): [CellTimeMode, (m: CellTimeMode) => void] {
  const [mode, setMode] = useState<CellTimeMode>("relative");
  useEffect(() => {
    setMode(readMode());
  }, []);
  return [mode, setMode];
}

export interface CellTimeProps {
  value: string | number | Date | undefined;
  className?: string;
}

/** 时间单元格：时区感知；点击切换 相对↔绝对（偏好记忆 localStorage 'fc:cell-time-mode'） */
export function CellTime({ value, className }: CellTimeProps) {
  const { prefs } = useDateTimePrefs();
  const now = useNow(30_000);
  const [mode, setMode] = useMode();

  const date =
    value === undefined || value === null || value === ""
      ? undefined
      : value instanceof Date
        ? value
        : new Date(value);
  if (date === undefined || Number.isNaN(date.getTime())) {
    return <span className={cn("text-muted-foreground text-[13px]", className)}>—</span>;
  }
  const iso = date.toISOString();
  const absolutePrefs: DateTimePrefs = {
    ...prefs,
    absolutePattern: prefs.absolutePattern ?? "datetime",
  };

  return (
    <button
      type="button"
      title={`切换显示（当前：${mode === "relative" ? "相对" : "绝对"}）
${formatAbsolute(iso, absolutePrefs)}`}
      onClick={() => {
        const next: CellTimeMode = mode === "relative" ? "absolute" : "relative";
        try {
          globalThis.localStorage?.setItem(MODE_KEY, next);
        } catch {
          /* 非浏览器环境 */
        }
        setMode(next);
      }}
      className={cn(
        "text-muted-foreground tabular-nums text-[13px] transition-colors hover:text-foreground",
        className,
      )}
      data-slot="cell-time"
    >
      {mode === "relative" ? formatRelative(iso, now) : formatAbsolute(iso, absolutePrefs)}
    </button>
  );
}
