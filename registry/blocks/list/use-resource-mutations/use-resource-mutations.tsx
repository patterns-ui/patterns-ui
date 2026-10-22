import type { BulkResult, MutationOpts, Resource } from "@fleetly/patterns-ui-core/data";
import type { UndoableToastControl } from "@fleetly/patterns-ui-core/mutation";
import { cn } from "cn";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export interface UseResourceMutationsOptions {
  /** undoable 倒计时（ms），默认 5000 */
  undoDurationMs?: number;
  /** 单项操作成功提示开关（默认开；bulk 结果汇总恒开） */
  successToast?: boolean;
}

function summarize(label: string, result: BulkResult | undefined): void {
  if (!result) {
    toast.success(`${label}完成`);
    return;
  }
  const { succeeded, failed } = result;
  if (failed.length === 0) toast.success(`${label}完成（${succeeded.length} 项）`);
  else toast.warning(`${label}：成功 ${succeeded.length}，失败 ${failed.length}`);
}

/** undoable toast 视图：自带每秒倒数；toast 只渲染一次（重发 upsert 会触发 onDismiss → 意外立即提交） */
function UndoableToastView({
  ctl,
  initialSeconds,
  onClose,
  className,
}: {
  ctl: UndoableToastControl;
  initialSeconds: number;
  onClose: () => void;
  className?: string;
}) {
  const [secondsLeft, setSecondsLeft] = useState(initialSeconds);
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(timer);
  }, []);
  return (
    <div
      data-slot="undoable-toast"
      className={cn(
        "bg-popover text-popover-foreground pointer-events-auto flex w-full items-center justify-between gap-4 rounded-lg border px-4 py-3 shadow-lg",
        className,
      )}
    >
      <p className="text-sm">
        已应用变更，<span className="tabular-nums">{secondsLeft}</span>s 内可撤销
      </p>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          ctl.undo();
          onClose();
        }}
      >
        撤销（{secondsLeft}s）
      </Button>
    </div>
  );
}

/**
 * createResource 消费层的 toast 接线（宿主侧惯例 helper，放 registry 便于 copy-paste）：
 * 把 undoable 档的 onUndoableToast 接到 sonner —— 倒计时 Undo 按钮；用户提前关闭 toast
 * 视为已确认（立即提交）。core 只发事件不含 UI。
 *
 * 注意：mutation opts 经 ref 惰性创建一次（每次 render 重建会换 key，undo 标记对不上 onSuccess）。
 *
 * 用法：组件内 `const { useDeleteWithUndo } = useResourceMutations(resource);`
 * 然后与普通 hook 一样调用 `const del = useDeleteWithUndo(); del.mutate({ id })`。
 */
export function useResourceMutations<TData, TCreate, TUpdate>(
  resource: Resource<TData, TCreate, TUpdate>,
  options: UseResourceMutationsOptions = {},
) {
  const { undoDurationMs = 5000, successToast = true } = options;
  /** undo 标记：key 在 opts 首次创建时固定（见上） */
  const undoneFlags = useRef(new Map<string, boolean>());
  const seq = useRef(0);

  const deleteOptsRef = useRef<MutationOpts<{ id: string }> | null>(null);
  const bulkDeleteOptsRef = useRef<MutationOpts<{ ids: string[] }> | null>(null);

  const makeUndoableOpts = <TVars,>(key: string, successMessage: string): MutationOpts<TVars> => {
    let toastShown = false;
    return {
      mutationMode: "undoable",
      undoDurationMs,
      onUndoableToast: (rawCtl: UndoableToastControl) => {
        if (toastShown) {
          // 后续每秒回调只驱动 core 侧时序，不再重发 toast（upsert 会误触发 onDismiss）
          return;
        }
        toastShown = true;
        const ctl: UndoableToastControl = {
          ...rawCtl,
          undo: () => {
            undoneFlags.current.set(key, true);
            rawCtl.undo();
            toast.info("已撤销，未提交变更");
          },
        };
        toast.custom(
          (t) => (
            <UndoableToastView
              ctl={ctl}
              initialSeconds={ctl.secondsLeft}
              onClose={() => toast.dismiss(t)}
            />
          ),
          {
            duration: undoDurationMs + 500,
            onDismiss: () => {
              // 用户提前关掉 toast = 已知晓 → 立即提交（与超时等价；超时后此处 no-op）
              ctl.dismiss();
            },
          },
        );
      },
      onSuccess: () => {
        if (undoneFlags.current.get(key)) {
          undoneFlags.current.delete(key);
          return;
        }
        if (successToast) toast.success(successMessage);
      },
    };
  };

  return {
    /** undoable 删除：行立即消失 + toast 倒计时撤销恢复 */
    useDeleteWithUndo: () => {
      if (deleteOptsRef.current === null) {
        seq.current += 1;
        deleteOptsRef.current = makeUndoableOpts<{ id: string }>(`del-${seq.current}`, "已删除");
      }
      return resource.useDelete(deleteOptsRef.current);
    },
    /** undoable 批量删除（SelectionBar 动作接它）；结果汇总 成功 N 失败 M */
    useBulkDeleteWithUndo: () => {
      if (bulkDeleteOptsRef.current === null) {
        seq.current += 1;
        const key = `bulk-del-${seq.current}`;
        bulkDeleteOptsRef.current = {
          ...makeUndoableOpts<{ ids: string[] }>(key, "批量删除"),
          onSuccess: (data) => summarize("批量删除", data as BulkResult | undefined),
        };
      }
      return resource.useBulkDelete(bulkDeleteOptsRef.current);
    },
    /** 悲观批量更新（结果汇总） */
    useBulkUpdate: () =>
      resource.useBulkUpdate({
        onSuccess: (data) => summarize("批量更新", data as BulkResult | undefined),
      }),
  };
}
