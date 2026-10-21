import { AlertTriangle, KeyRound } from "lucide-react";
import type { ReactNode } from "react";
import { CopyButton } from "@/components/blocks/shared/copy-button/copy-button";
import { Button } from "@/components/ui/button";

export interface SecretRevealProps {
  /** 一次性密钥（创建响应带回；服务端不会再次返回） */
  secret: string;
  /** 副标题说明（默认自动生成） */
  note?: ReactNode;
  /** 完成按钮文案，默认「我已保存」 */
  doneLabel?: string;
  /** 点击完成后回调（关闭弹窗/跳转） */
  onDone?: () => void;
}

/**
 * 一次性密钥展示流：警示横幅（仅显示一次）+ mono 密钥块 + 复制按钮 + 完成确认。
 * 再次查看不可得由服务端保证（GET 不返回 secret）；本组件只承接创建响应的一次性展示。
 */
export function SecretReveal({ secret, note, doneLabel = "我已保存", onDone }: SecretRevealProps) {
  return (
    <div className="space-y-4">
      <div className="border-status-warning/40 bg-status-warning-bg text-status-warning flex items-start gap-2.5 rounded-lg border p-3 text-sm">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div className="space-y-1">
          <p className="font-medium">此密钥仅显示一次</p>
          <p className="text-status-warning/90">
            {note ?? "离开此页后将无法再次查看，请立即复制并妥善保存。"}
          </p>
        </div>
      </div>

      <div className="bg-muted/50 flex items-center gap-2 rounded-lg border p-3">
        <KeyRound className="text-muted-foreground size-4 shrink-0" />
        <code className="min-w-0 flex-1 truncate font-mono text-sm select-all">{secret}</code>
        <CopyButton value={secret} />
      </div>

      {onDone ? (
        <div className="flex justify-end">
          <Button type="button" onClick={onDone}>
            {doneLabel}
          </Button>
        </div>
      ) : null}
    </div>
  );
}
