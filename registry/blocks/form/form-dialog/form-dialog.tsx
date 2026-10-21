import { cn } from "cn";
import type { ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SIZES = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
} as const;

export interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** 尺寸档：sm/md/lg，默认 md */
  size?: keyof typeof SIZES;
  footer?: ReactNode;
  /** 表单提交回调（footer 里的 type=submit 按钮触发；如 `() => void form.handleSubmit()`） */
  onSubmit?: () => void;
  children: ReactNode;
}

/** 弹窗表单宿主（小表单/创建流）：头部 + 主体 + 底部动作。 */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  size = "md",
  footer,
  onSubmit,
  children,
}: FormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("flex w-full flex-col gap-4", SIZES[size])}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            onSubmit?.();
          }}
        >
          {children}
          {footer ? <DialogFooter>{footer}</DialogFooter> : null}
        </form>
      </DialogContent>
    </Dialog>
  );
}
