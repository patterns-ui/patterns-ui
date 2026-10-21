import { Inbox, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export interface EmptyStateProps {
  /** 默认 Inbox 图标 */
  icon?: LucideIcon;
  title: string;
  description?: string;
  /** CTA（按钮等） */
  action?: ReactNode;
  className?: string;
}

/** 空态：图标 + 标题 + 描述 + 可选 CTA */
export function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={`flex flex-col items-center justify-center gap-3 px-6 py-16 text-center ${className ?? ""}`}
    >
      <div className="bg-muted text-muted-foreground flex size-11 items-center justify-center rounded-full">
        <Icon className="size-5" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{title}</p>
        {description ? (
          <p className="text-muted-foreground max-w-sm text-[13px] whitespace-pre-line">
            {description}
          </p>
        ) : null}
      </div>
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
