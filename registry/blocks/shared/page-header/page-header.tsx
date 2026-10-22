import { cn } from "cn";
import type { ReactNode } from "react";

/**
 * 页头标题排版的单一事实源（M6-D 收敛）：此前 14 处平行手写同款 22px 标题样式
 * （blocks 11 + demo 3）。尺寸以 rem 表达（22px = 1.375rem @16px root），
 * 随根字号缩放；需要同款排版而非整块页头的场合（如卡片标题）复用 pageTitleClass。
 */
export const pageTitleClass = "text-[1.375rem] font-semibold tracking-tight";

export interface PageHeaderProps {
  title: ReactNode;
  /** 标题下说明（muted 13px） */
  description?: ReactNode;
  /** 标题上方的小标（uppercase eyebrow，如租户名 / 模块名） */
  eyebrow?: ReactNode;
  className?: string;
}

/** 页头原语：eyebrow? + h1 + description?（动作区由页面在外层组合，保持原语无槽） */
export function PageHeader({ title, description, eyebrow, className }: PageHeaderProps) {
  return (
    <div className={cn("flex flex-col gap-1", className)} data-slot="page-header">
      {eyebrow ? (
        <p className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
          {eyebrow}
        </p>
      ) : null}
      <h1 className={pageTitleClass}>{title}</h1>
      {description ? <p className="text-muted-foreground text-[13px]">{description}</p> : null}
    </div>
  );
}
