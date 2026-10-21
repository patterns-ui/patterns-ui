import { cn } from "cn";
import { Badge } from "@/components/ui/badge";

export interface EnumBadgeOption {
  value: string;
  label?: string;
  /** Badge variant（default/secondary/outline/ghost…），未配置用 secondary */
  variant?: "default" | "secondary" | "destructive" | "outline" | "ghost";
}

export interface CellEnumBadgeProps {
  value: string | undefined;
  options: EnumBadgeOption[];
  className?: string;
}

/** 枚举单元格：值 → Badge（选项表驱动 variant 与文案；未命中 outline 兜底） */
export function CellEnumBadge({ value, options, className }: CellEnumBadgeProps) {
  if (value === undefined || value === null || value === "") {
    return <span className={cn("text-muted-foreground text-[13px]", className)}>—</span>;
  }
  const option = options.find((o) => o.value === value);
  return (
    <Badge variant={option?.variant ?? "outline"} className={className} data-slot="cell-enum-badge">
      {option?.label ?? value}
    </Badge>
  );
}
