import {
  type DateTimePrefs,
  formatAbsolute,
  formatRelative,
  useDateTimePrefs,
  useNow,
} from "@patterns-ui/core/datetime";
import { createStorage } from "@patterns-ui/core/storage";
import { cn } from "cn";
import { useEffect, useState } from "react";
import { z } from "zod";

type CellTimeMode = "relative" | "absolute";

/** 显示模式偏好存储（偏好语义 fc:cell-time-mode；createStorage 单源，M6-B。
 *  旧裸字符串经 migrate 归一：非 "absolute" 一律回落 "relative"） */
const modeStorage = createStorage("fc:cell-time-mode", z.enum(["relative", "absolute"]), {
  version: 1,
  migrate: (raw) => (raw === "absolute" ? "absolute" : "relative"),
});

function readMode(): CellTimeMode {
  return modeStorage.read() ?? "relative";
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
        modeStorage.write(next);
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
