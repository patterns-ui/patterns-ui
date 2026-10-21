/**
 * demo：表单页共用件 —— 草稿自动保存接线、dirty guard 确认框、草稿恢复横幅。
 */

import type { DirtyGuardState } from "@fleetly/ui-component-core/form";
import { useFormDirtyGuard } from "@fleetly/ui-component-core/form";
import { FileWarning } from "lucide-react";
import { useEffect } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/blocks/form/confirm-dialog/confirm-dialog";
import { Button } from "@/components/ui/button";

/**
 * 草稿自动保存：订阅 form.store（零重渲染），values 变化 → resourceForm.saveDraft（防抖在 core 内）。
 */
export function useFormDraftAutosave(
  // biome-ignore lint/suspicious/noExplicitAny: 表单实例跨 block 松类型传递
  form: any,
  saveDraft: (values: unknown) => void,
): void {
  useEffect(() => {
    const subscription = form.store.subscribe(() => {
      // 仅脏态写草稿：mount/字段注册/reset 等 store 更新不覆盖已有草稿
      if (form.store.state.isDirty !== true) return;
      saveDraft(form.store.state.values);
    }) as { unsubscribe: () => void };
    return () => subscription.unsubscribe();
  }, [form, saveDraft]);
}

/** dirty guard 宿主：form.Subscribe(isDirty) → 本组件（真组件内调用 hooks）→ 确认框 */
export function DirtyGuardHost({
  form,
  onBlocked,
}: {
  // biome-ignore lint/suspicious/noExplicitAny: 表单实例跨 block 松类型传递
  form: any;
  onBlocked?: () => void;
}) {
  return (
    <form.Subscribe
      selector={(s: { isDirty: boolean; isSubmitting: boolean; isSubmitSuccessful: boolean }) =>
        [s.isDirty, s.isSubmitting, s.isSubmitSuccessful] as const
      }
    >
      {([isDirty, isSubmitting, isSubmitSuccessful]: readonly [boolean, boolean, boolean]) => (
        <GuardBody
          isDirty={isDirty}
          submitActive={isSubmitting || isSubmitSuccessful}
          onBlocked={onBlocked}
        />
      )}
    </form.Subscribe>
  );
}

function GuardBody({
  isDirty,
  submitActive,
  onBlocked,
}: {
  isDirty: boolean;
  /** 提交中/已成功：redirect 引发的导航自动放行（不弹确认） */
  submitActive: boolean;
  onBlocked?: () => void;
}) {
  // 提交期间/成功后解除 guard：useResourceForm 的 redirect 导航不被自身拦截
  const guard: DirtyGuardState = useFormDirtyGuard(isDirty, !submitActive);
  useEffect(() => {
    if (guard.blocked && submitActive) {
      guard.proceed();
      return;
    }
    if (guard.blocked) onBlocked?.();
  }, [guard.blocked, guard, submitActive, onBlocked]);
  return (
    <ConfirmDialog
      open={guard.blocked}
      onOpenChange={(open) => {
        if (!open) guard.stay();
      }}
      danger
      title="有未保存的修改"
      description="离开本页将丢弃未保存的修改（草稿仍会保留在本地，下次进入可恢复）。确定离开吗？"
      confirmLabel="离开"
      cancelLabel="留在本页"
      onConfirm={() => {
        guard.proceed();
        toast.info("已离开编辑页（演示：草稿保留）");
      }}
    />
  );
}

/** 草稿恢复横幅：「已恢复未保存草稿」+ 丢弃按钮 */
export function DraftRestoredBanner({
  restored,
  onDiscard,
}: {
  restored: boolean;
  onDiscard: () => void;
}) {
  if (!restored) return null;
  return (
    <div className="border-status-warning/40 bg-status-warning-bg text-status-warning flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm">
      <FileWarning className="size-4 shrink-0" />
      <span className="flex-1">已恢复未保存的草稿（自动保存于本地）。</span>
      <Button type="button" variant="outline" size="sm" onClick={onDiscard}>
        丢弃草稿
      </Button>
    </div>
  );
}
