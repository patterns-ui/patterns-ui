import { cn } from "cn";
import { Check, Minus } from "lucide-react";

export interface CellBooleanProps {
  value: boolean | undefined | null;
  /** 值文案（如 "启用/停用"）；缺省只渲染图标 */
  labels?: [string, string];
  className?: string;
}

/** 布尔单元格：true → 勾（success 令牌）；false/缺省 → 横线（muted），语义色不硬编码 */
export function CellBoolean({ value, labels, className }: CellBooleanProps) {
  const truthy = value === true;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[13px]",
        truthy ? "text-status-success" : "text-muted-foreground",
        className,
      )}
      data-slot="cell-boolean"
    >
      {truthy ? (
        <Check className="size-3.5" aria-label={labels?.[0] ?? "是"} />
      ) : (
        <Minus className="size-3.5" aria-label={labels?.[1] ?? "否"} />
      )}
      {labels ? <span>{truthy ? labels[0] : labels[1]}</span> : null}
    </span>
  );
}
