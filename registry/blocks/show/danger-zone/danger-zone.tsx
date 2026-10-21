/**
 * danger-zone —— 危险操作区（底部红框卡 + 动作列表 + confirm 接线）。
 * 确认交互经 confirm-dialog block（普通/type-to-confirm）由本组件内部编排。
 */
import { AlertOctagon } from "lucide-react";
import { type ReactNode, useState } from "react";
import { ConfirmDialog } from "@/components/blocks/form/confirm-dialog/confirm-dialog";
import { Button } from "@/components/ui/button";

export interface DangerAction {
  label: ReactNode;
  description?: ReactNode;
  /** 高危变体：输入该名称才允许确认 */
  typeToConfirm?: string;
  typeToConfirmLabel?: string;
  confirmLabel?: string;
  danger?: boolean;
  pending?: boolean;
  /** 确认后执行（danger-zone 内部弹 confirm） */
  run: () => void | Promise<void>;
  /** 覆盖右侧按钮渲染（如需要异步状态） */
  renderTrigger?: (open: () => void) => ReactNode;
}

export interface DangerZoneProps {
  title?: ReactNode;
  description?: ReactNode;
  actions: DangerAction[];
}

/** 红框卡：danger 语义 token（--status-danger），动作逐行 + 右侧触发按钮。 */
export function DangerZone({
  title = "危险操作区",
  description = "以下操作不可撤销，请确认后再执行。",
  actions,
}: DangerZoneProps) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const active = activeIndex !== null ? actions[activeIndex] : undefined;

  return (
    <section className="border-status-danger/40 rounded-xl border">
      <header className="border-status-danger/40 flex items-start gap-2.5 border-b px-5 py-4">
        <AlertOctagon className="text-status-danger mt-0.5 size-4 shrink-0" />
        <div>
          <h2 className="text-status-danger text-sm font-medium">{title}</h2>
          <p className="text-muted-foreground text-sm">{description}</p>
        </div>
      </header>
      <ul className="divide-border divide-y">
        {actions.map((action, index) => (
          <li key={index} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">{action.label}</p>
              {action.description ? (
                <p className="text-muted-foreground mt-0.5 text-sm">{action.description}</p>
              ) : null}
            </div>
            {action.renderTrigger ? (
              action.renderTrigger(() => setActiveIndex(index))
            ) : (
              <Button
                type="button"
                variant="destructive"
                size="sm"
                disabled={action.pending}
                onClick={() => setActiveIndex(index)}
              >
                {action.confirmLabel ?? "执行"}
              </Button>
            )}
          </li>
        ))}
      </ul>

      {active ? (
        <ConfirmDialog
          open={activeIndex !== null}
          onOpenChange={(open) => {
            if (!open) setActiveIndex(null);
          }}
          danger={active.danger !== false}
          title={active.label}
          description={active.description}
          typeToConfirm={active.typeToConfirm}
          typeToConfirmLabel={active.typeToConfirmLabel}
          confirmLabel={active.confirmLabel ?? "确认执行"}
          pending={active.pending}
          onConfirm={async () => {
            try {
              await active.run();
            } finally {
              setActiveIndex(null);
            }
          }}
        />
      ) : null}
    </section>
  );
}
