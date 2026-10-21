import { cn } from "cn";
import type { ReactNode } from "react";

export interface ListPageProps {
  title: string;
  description?: string;
  /** 页头右侧动作区（新建按钮等） */
  actions?: ReactNode;
  /** 页头与过滤条之间的统计区（stat-strip 等） */
  lead?: ReactNode;
  /** 过滤区（filter-bar） */
  filter?: ReactNode;
  /** 过滤条与表格之间（selection-bar / new-items-banner / refresh-bar） */
  toolbar?: ReactNode;
  /** 表格区（async-state 包裹的 data-table 等） */
  body: ReactNode;
  /** 表格下（pagination-bar） */
  pagination?: ReactNode;
  /** 页尾附加槽（说明 / 引用等） */
  appendix?: ReactNode;
  className?: string;
}

/** 列表页模板（table 变体）：PageHeader + lead + FilterBar + AsyncState(DataTable) + PaginationBar + appendix */
export function ListPage({
  title,
  description,
  actions,
  lead,
  filter,
  toolbar,
  body,
  pagination,
  appendix,
  className,
}: ListPageProps) {
  return (
    <div className={cn("flex flex-col gap-5 pb-6", className)} data-slot="list-page">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
          {description ? <p className="text-muted-foreground text-[13px]">{description}</p> : null}
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </header>

      {lead}

      {filter}
      {toolbar}
      {body}
      {pagination}
      {appendix}
    </div>
  );
}
