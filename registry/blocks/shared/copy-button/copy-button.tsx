import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export interface CopyButtonProps {
  value: string;
  label?: string;
  /** 成功反馈展示时长，默认 2000ms */
  feedbackMs?: number;
  className?: string;
}

/** 复制按钮：点击写剪贴板，成功反馈 2s（Copy → Check） */
export function CopyButton({ value, label, feedbackMs = 2000, className }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      // 剪贴板权限不可用时退化尝试已废弃的 execCommand
      try {
        document.execCommand("copy");
      } catch {
        return;
      }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), feedbackMs);
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size={label ? "icon-sm" : "icon-xs"}
      aria-label={copied ? "已复制" : "复制"}
      className={className}
      onClick={handleCopy}
    >
      {copied ? <Check className="text-status-success" /> : <Copy />}
      {label ? <span>{copied ? "已复制" : label}</span> : null}
    </Button>
  );
}
