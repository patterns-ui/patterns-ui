import type {
  BulkResult,
  MutationOpts,
  Resource,
  UndoableToastControl,
} from "@patterns-ui/core/data";
import { cn } from "cn";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/**
 * undoable/toast 默认文案（M6-E 文案对象化：④ 文案从 ② 逻辑解焊）。
 * 宿主可经 `useResourceMutations(resource, { messages })` 部分覆盖，缺省与
 * DEFAULT 合并（调用点不传 = 行为不变）。带参文案用函数形态（可保留数字排版节点）。
 */
export interface UseResourceMutationsMessages {
  /** 单项删除成功提示 */
  deleted: string;
  /** 批量删除的动作名（成功/汇总前缀） */
  bulkDeleted: string;
  /** 批量更新的动作名（成功/汇总前缀） */
  bulkUpdated: string;
  /** bulk 无结果集时的成功提示 */
  done: (label: string) => string;
  /** bulk 全部成功汇总 */
  doneCount: (label: string, count: number) => string;
  /** bulk 部分失败汇总 */
  partial: (label: string, succeeded: number, failed: number) => string;
  /** undoable toast 正文（倒计时秒数入参；返回 ReactNode 以保留 tabular-nums 排版） */
  undoableNotice: (secondsLeft: number) => ReactNode;
  /** undoable toast 撤销按钮文案 */
  undoAction: (secondsLeft: number) => ReactNode;
  /** 用户撤销后的提示 */
  undone: string;
}

export const DEFAULT_USE_RESOURCE_MUTATIONS_MESSAGES: UseResourceMutationsMessages = {
  deleted: "已删除",
  bulkDeleted: "批量删除",
  bulkUpdated: "批量更新",
  done: (label) => `${label}完成`,
  doneCount: (label, count) => `${label}完成（${count} 项）`,
  partial: (label, succeeded, failed) => `${label}：成功 ${succeeded}，失败 ${failed}`,
  undoableNotice: (secondsLeft) => (
    <>
      已应用变更，<span className="tabular-nums">{secondsLeft}</span>s 内可撤销
    </>
  ),
  undoAction: (secondsLeft) => <>撤销（{secondsLeft}s）</>,
  undone: "已撤销，未提交变更",
};

export interface UseResourceMutationsOptions {
  /** undoable 倒计时（ms），默认 5000 */
  undoDurationMs?: number;
  /** 单项操作成功提示开关（默认开；bulk 结果汇总恒开） */
  successToast?: boolean;
  /** 默认文案部分覆盖（缺省合并 DEFAULT_USE_RESOURCE_MUTATIONS_MESSAGES） */
  messages?: Partial<UseResourceMutationsMessages>;
}

function summarize(
  label: string,
  result: BulkResult | undefined,
  messages: UseResourceMutationsMessages,
): void {
  if (!result) {
    toast.success(messages.done(label));
    return;
  }
  const { succeeded, failed } = result;
  if (failed.length === 0) toast.success(messages.doneCount(label, succeeded.length));
  else toast.warning(messages.partial(label, succeeded.length, failed.length));
}

/** undoable toast 视图：自带每秒倒数；toast 只渲染一次（重发 upsert 会触发 onDismiss → 意外立即提交） */
function UndoableToastView({
  ctl,
  initialSeconds,
  onClose,
  messages,
  className,
}: {
  ctl: UndoableToastControl;
  initialSeconds: number;
  onClose: () => void;
  messages: UseResourceMutationsMessages;
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
      <p className="text-sm">{messages.undoableNotice(secondsLeft)}</p>
      <Button
        size="sm"
        variant="outline"
        onClick={() => {
          ctl.undo();
          onClose();
        }}
      >
        {messages.undoAction(secondsLeft)}
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
  const messages: UseResourceMutationsMessages = {
    ...DEFAULT_USE_RESOURCE_MUTATIONS_MESSAGES,
    ...options.messages,
  };
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
            toast.info(messages.undone);
          },
        };
        toast.custom(
          (t) => (
            <UndoableToastView
              ctl={ctl}
              initialSeconds={ctl.secondsLeft}
              onClose={() => toast.dismiss(t)}
              messages={messages}
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
        deleteOptsRef.current = makeUndoableOpts<{ id: string }>(
          `del-${seq.current}`,
          messages.deleted,
        );
      }
      return resource.useDelete(deleteOptsRef.current);
    },
    /** undoable 批量删除（SelectionBar 动作接它）；结果汇总 成功 N 失败 M */
    useBulkDeleteWithUndo: () => {
      if (bulkDeleteOptsRef.current === null) {
        seq.current += 1;
        const key = `bulk-del-${seq.current}`;
        bulkDeleteOptsRef.current = {
          ...makeUndoableOpts<{ ids: string[] }>(key, messages.bulkDeleted),
          onSuccess: (data) =>
            summarize(messages.bulkDeleted, data as BulkResult | undefined, messages),
        };
      }
      return resource.useBulkDelete(bulkDeleteOptsRef.current);
    },
    /** 悲观批量更新（结果汇总） */
    useBulkUpdate: () =>
      resource.useBulkUpdate({
        onSuccess: (data) =>
          summarize(messages.bulkUpdated, data as BulkResult | undefined, messages),
      }),
  };
}
