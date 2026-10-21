import { cn } from "cn";

export type CellNumberFormat = "int" | "decimal" | "percent" | "bytes";

function formatValue(value: number, format: CellNumberFormat): string {
  switch (format) {
    case "int":
      return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
    case "decimal":
      return new Intl.NumberFormat(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(value);
    case "percent":
      return new Intl.NumberFormat(undefined, {
        style: "percent",
        minimumFractionDigits: 0,
        maximumFractionDigits: 1,
      }).format(value);
    case "bytes": {
      const units = ["B", "KB", "MB", "GB", "TB"];
      let v = value;
      let unit = 0;
      while (v >= 1024 && unit < units.length - 1) {
        v /= 1024;
        unit += 1;
      }
      return `${new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(v)} ${units[unit]}`;
    }
  }
}

export interface CellNumberProps {
  value: number | undefined | null;
  format?: CellNumberFormat;
  /** 单位后缀（如 " 个" / "ms"） */
  unit?: string;
  className?: string;
}

/** 数值单元格：tabular-nums + Intl 格式化（int/decimal/percent/bytes） + 可选单位 */
export function CellNumber({ value, format = "int", unit, className }: CellNumberProps) {
  if (value === undefined || value === null || Number.isNaN(value)) {
    return (
      <span className={cn("text-muted-foreground tabular-nums text-[13px]", className)}>—</span>
    );
  }
  return (
    <span className={cn("tabular-nums text-[13px]", className)} data-slot="cell-number">
      {formatValue(value, format)}
      {unit ? <span className="text-muted-foreground ml-0.5 text-xs">{unit}</span> : null}
    </span>
  );
}
