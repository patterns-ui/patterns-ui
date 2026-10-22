/**
 * inline-edit-field —— 点击即改字段（TriggerLink → 编辑态 → 保存/取消）。
 */
import { cn } from "cn";
import { Check, Loader2, Pencil, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface InlineEditFieldProps {
  value: string | number | undefined;
  /** 保存（异步）；抛错则回退显示原值（错误处理由调用方 toast） */
  onSave?: (next: string) => Promise<void> | void;
  /** 编辑控件类型，默认 text */
  type?: "text" | "number";
  placeholder?: string;
  /** 空值占位（默认「点击编辑」） */
  emptyLabel?: string;
  disabled?: boolean;
  /** 展示态格式化（如数字单位） */
  format?: (value: string | number | undefined) => string;
  className?: string;
}

/** 点击即改：展示态是可点击的下划线虚线文本 → 进入编辑 → Enter/✓ 保存、Esc/✕ 取消。 */
export function InlineEditField({
  value,
  onSave,
  type = "text",
  placeholder,
  emptyLabel = "点击编辑",
  disabled = false,
  format,
  className,
}: InlineEditFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const beginEdit = () => {
    if (disabled) return;
    setDraft(value === undefined || value === null ? "" : String(value));
    setEditing(true);
  };

  const cancel = () => {
    setEditing(false);
    setDraft("");
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave?.(draft);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  if (editing) {
    return (
      <span className={cn("inline-flex items-center gap-1.5", className)}>
        <Input
          ref={inputRef}
          type={type}
          value={draft}
          placeholder={placeholder}
          className="h-7 w-36"
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void save();
            } else if (e.key === "Escape") {
              e.preventDefault();
              cancel();
            }
          }}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="保存"
          disabled={saving}
          onClick={() => void save()}
        >
          {saving ? (
            <Loader2 className="animate-spin" />
          ) : (
            <Check className="text-status-success" />
          )}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-xs"
          aria-label="取消"
          disabled={saving}
          onClick={cancel}
        >
          <X className="text-muted-foreground" />
        </Button>
      </span>
    );
  }

  const empty = value === undefined || value === null || value === "";
  return (
    <button
      type="button"
      className={cn(
        "group/inline-edit hover:border-border focus-visible:border-ring inline-flex max-w-full items-center gap-1.5 border-b border-dashed border-transparent text-left text-sm transition-colors outline-none",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
        className,
      )}
      disabled={disabled}
      onClick={beginEdit}
    >
      {empty ? (
        <span className="text-muted-foreground/70">{emptyLabel}</span>
      ) : (
        <span className="truncate">{format ? format(value) : String(value)}</span>
      )}
      {!disabled ? (
        <Pencil className="text-muted-foreground/50 group-hover/inline-edit:text-muted-foreground size-3 shrink-0 opacity-0 transition-opacity group-hover/inline-edit:opacity-100" />
      ) : null}
    </button>
  );
}
