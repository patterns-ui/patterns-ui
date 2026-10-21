import { cn } from "cn";
import { Check, Copy } from "lucide-react";
import { useEffect, useState } from "react";

export interface CellIdProps {
  value: string | undefined;
  /** 显示位数（前缀截断展示，复制始终全量），默认 8 */
  chars?: number;
  className?: string;
}

/** ID 单元格：mono + 截断 + hover 复制（复制成功 2s 反馈） */
export function CellId({ value, chars = 8, className }: CellIdProps) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(timer);
  }, [copied]);

  if (value === undefined || value === null || value === "") {
    return <span className={cn("text-muted-foreground font-mono text-xs", className)}>—</span>;
  }

  const display = value.length > chars ? value.slice(0, chars) : value;
  return (
    <button
      type="button"
      title={`复制 ${value}`}
      onClick={() => {
        if (navigator?.clipboard) {
          void navigator.clipboard.writeText(value);
          setCopied(true);
        }
      }}
      className={cn(
        "group/cell-id inline-flex max-w-full items-center gap-1 rounded font-mono text-xs",
        "text-muted-foreground transition-colors hover:text-foreground",
        className,
      )}
      data-slot="cell-id"
    >
      <span className="truncate">{display}</span>
      {copied ? (
        <Check className="size-3 shrink-0 text-status-success" />
      ) : (
        <Copy className="size-3 shrink-0 opacity-0 transition-opacity group-hover/cell-id:opacity-100" />
      )}
    </button>
  );
}
