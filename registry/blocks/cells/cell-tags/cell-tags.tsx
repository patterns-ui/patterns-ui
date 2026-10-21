import { cn } from "cn";
import { Badge } from "@/components/ui/badge";

export interface CellTagsProps {
  values: string[] | undefined;
  /** 最多展示几个标签，超出 +N，默认 3 */
  max?: number;
  className?: string;
}

/** 标签单元格：标签组（secondary Badge），超出 max 折叠为 +N */
export function CellTags({ values, max = 3, className }: CellTagsProps) {
  if (values === undefined || values === null || values.length === 0) {
    return <span className={cn("text-muted-foreground text-[13px]", className)}>—</span>;
  }
  const visible = values.slice(0, max);
  const overflow = values.length - visible.length;
  return (
    <span className={cn("flex flex-wrap items-center gap-1", className)} data-slot="cell-tags">
      {visible.map((tag) => (
        <Badge key={tag} variant="secondary" className="font-normal">
          {tag}
        </Badge>
      ))}
      {overflow > 0 ? (
        <span className="text-muted-foreground text-xs" title={values.slice(max).join(", ")}>
          +{overflow}
        </span>
      ) : null}
    </span>
  );
}
