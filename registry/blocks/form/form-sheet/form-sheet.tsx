import { cn } from "cn";
import type { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

const WIDTHS = {
  sm: "sm:max-w-md",
  md: "sm:max-w-xl",
  lg: "sm:max-w-3xl",
} as const;

export interface FormSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** 宽度档：sm(28rem)/md(36rem)/lg(48rem)，默认 md */
  width?: keyof typeof WIDTHS;
  /** 底部动作条（sticky）：提交/取消等 */
  footer?: ReactNode;
  children: ReactNode;
}

/** 抽屉表单宿主（复杂表单）：头部标题描述 + 滚动主体 + sticky 底部动作条。 */
export function FormSheet({
  open,
  onOpenChange,
  title,
  description,
  width = "md",
  footer,
  children,
}: FormSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className={cn("flex w-full flex-col gap-0 p-0", WIDTHS[width])}>
        <SheetHeader className="border-b px-6 py-4">
          <SheetTitle>{title}</SheetTitle>
          {description ? <SheetDescription>{description}</SheetDescription> : null}
        </SheetHeader>
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="flex flex-col gap-5">{children}</div>
        </div>
        {footer ? (
          <div className="border-t px-6 py-3">
            <div className="flex items-center justify-end gap-2">{footer}</div>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
