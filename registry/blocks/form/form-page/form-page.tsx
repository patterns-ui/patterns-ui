import { Link } from "@tanstack/react-router";
import { cn } from "cn";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export interface FormPageSection {
  title: string;
  description?: string;
  /** 字段区（右列） */
  children: ReactNode;
  /** 左列附加内容（如变更摘要 diff-viewer） */
  aside?: ReactNode;
}

export interface FormPageProps {
  title: ReactNode;
  description?: ReactNode;
  /** 返回链接（to 为路由 path） */
  backTo?: { to: string; label?: string };
  /** 页头右侧动作（如草稿提示） */
  actions?: ReactNode;
  /** 分区表单（左侧标题描述 / 右侧字段）；与 children 二选一 */
  sections?: FormPageSection[];
  /** 完全自定义表单体（不用分区布局时） */
  children?: ReactNode;
  /** 底部动作条（sticky）：保存/取消等 */
  footer?: ReactNode;
  /** 表单提交回调（footer 内 type=submit 触发；如 `() => void form.handleSubmit()`） */
  onSubmit?: () => void;
  /** 整页宽度（默认表单页舒适宽） */
  className?: string;
}

/**
 * 整页表单宿主：页头(返回/标题/动作) + 分区表单(左标题右字段) + sticky 底部动作条。
 * 纯布局不含数据逻辑；表单实例由 typed-form-field 的 useAppForm 创建后传入 children。
 */
export function FormPage({
  title,
  description,
  backTo,
  actions,
  sections,
  children,
  footer,
  onSubmit,
  className,
}: FormPageProps) {
  return (
    <form
      className={cn("mx-auto flex w-full max-w-4xl flex-col gap-6", className)}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit?.();
      }}
    >
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {backTo ? (
            <Button variant="ghost" size="icon-sm" render={<Link to={backTo.to} />}>
              <ArrowLeft />
            </Button>
          ) : null}
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
            {description ? (
              <p className="text-muted-foreground mt-1 max-w-2xl text-sm">{description}</p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
      </header>

      {sections && sections.length > 0 ? (
        <div className="divide-border bg-card text-card-foreground overflow-hidden rounded-xl border">
          {sections.map((section) => (
            <section key={section.title} className="grid gap-6 px-6 py-6 sm:grid-cols-[240px_1fr]">
              <div className="space-y-1">
                <h2 className="text-sm font-medium">{section.title}</h2>
                {section.description ? (
                  <p className="text-muted-foreground text-sm">{section.description}</p>
                ) : null}
                {section.aside}
              </div>
              <div className="flex flex-col gap-5">{section.children}</div>
            </section>
          ))}
        </div>
      ) : null}

      {children}

      {footer ? (
        <div className="bg-background/95 supports-[backdrop-filter]:bg-background/80 sticky bottom-0 -mx-4 border-t px-4 py-3 backdrop-blur">
          <div className="flex items-center justify-end gap-2">{footer}</div>
        </div>
      ) : null}
    </form>
  );
}
