import { cn } from "cn";
import type { LucideIcon } from "lucide-react";
import { Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

export interface SelectionAction {
  label: string;
  icon?: LucideIcon;
  /** 危险动作（红色按钮） */
  danger?: boolean;
  /** 需要二次确认（按钮就地变为「确认 …」，3s 未确认自动复原） */
  confirm?: boolean | string;
  run: () => void | Promise<void>;
}

export interface SelectionBarProps {
  count: number;
  actions: SelectionAction[];
  onClear: () => void;
  className?: string;
}

/** 批量操作条：已选 N + 动作组（confirm 动作两段式确认）+ 清除选择 */
export function SelectionBar({ count, actions, onClear, className }: SelectionBarProps) {
  if (count === 0) return null;
  return (
    <div
      className={cn(
        "bg-primary/5 border-primary/20 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2",
        className,
      )}
      data-slot="selection-bar"
      role="toolbar"
      aria-label="批量操作"
    >
      <span className="text-primary text-[13px] font-medium tabular-nums">已选 {count} 项</span>
      <span className="bg-border h-4 w-px" aria-hidden />
      {actions.map((action) => (
        <SelectionActionButton key={action.label} action={action} />
      ))}
      <Button variant="ghost" size="sm" className="ml-auto" onClick={onClear} aria-label="清除选择">
        <X data-icon="inline-start" />
        清除
      </Button>
    </div>
  );
}

function SelectionActionButton({ action }: { action: SelectionAction }) {
  const [confirming, setConfirming] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const Icon = action.icon ?? (action.danger ? Trash2 : undefined);

  useEffect(() => {
    return () => {
      if (timer.current !== undefined) clearTimeout(timer.current);
    };
  }, []);

  const needsConfirm = action.confirm !== undefined;
  const confirmText = typeof action.confirm === "string" ? action.confirm : action.label;

  if (confirming) {
    return (
      <Button
        size="sm"
        variant={action.danger ? "destructive" : "default"}
        onClick={() => {
          setConfirming(false);
          void action.run();
        }}
      >
        确认{confirmText}？
      </Button>
    );
  }

  return (
    <Button
      size="sm"
      variant={action.danger ? "destructive" : "outline"}
      onClick={() => {
        if (needsConfirm) {
          setConfirming(true);
          timer.current = setTimeout(() => setConfirming(false), 3000);
          return;
        }
        void action.run();
      }}
    >
      {Icon ? <Icon data-icon="inline-start" /> : null}
      {action.label}
    </Button>
  );
}
