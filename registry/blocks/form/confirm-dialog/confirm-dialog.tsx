import { cn } from "cn";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** 危险操作（红色确认按钮 + 警示图标） */
  danger?: boolean;
  /** 高危变体：需输入该名称/标识才允许确认 */
  typeToConfirm?: string;
  /** typeToConfirm 输入框提示（默认取 typeToConfirm 本身） */
  typeToConfirmLabel?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** 确认中（禁用 + 转圈） */
  pending?: boolean;
  onConfirm: () => void | Promise<void>;
}

/**
 * 确认框：普通变体 + `typeToConfirm` 高危变体（输入指定名称才解锁确认按钮）。
 * danger 样式走 destructive 语义 token（--status-danger / --destructive）。
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  danger = false,
  typeToConfirm,
  typeToConfirmLabel,
  confirmLabel = "确认",
  cancelLabel = "取消",
  pending = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (!open) setTyped("");
  }, [open]);

  const needsTyping = typeToConfirm !== undefined && typeToConfirm !== "";
  const canConfirm = !needsTyping || typed === typeToConfirm;

  return (
    <Dialog open={open} onOpenChange={(next) => (pending ? undefined : onOpenChange(next))}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className={cn("flex items-center gap-2", danger && "text-destructive")}>
            {danger ? <AlertTriangle className="size-5 shrink-0" /> : null}
            {title}
          </DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>

        {needsTyping ? (
          <div className="space-y-1.5">
            <p className="text-muted-foreground text-sm">
              输入{" "}
              <span className="text-foreground font-medium">
                {typeToConfirmLabel ?? typeToConfirm}
              </span>{" "}
              以确认操作：
            </p>
            <Input
              value={typed}
              autoComplete="off"
              spellCheck={false}
              placeholder={typeToConfirmLabel ?? typeToConfirm}
              className="font-mono"
              onChange={(e) => setTyped(e.target.value)}
            />
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? "destructive" : "default"}
            disabled={!canConfirm || pending}
            onClick={() => {
              void onConfirm();
            }}
          >
            {pending ? <Loader2 className="animate-spin" /> : null}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
