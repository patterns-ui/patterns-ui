import { useCallback, useEffect, useRef } from "react";

/**
 * `useDebouncedCallback`（M6-B 工具单点化，paradigm.md §2.3「手写防抖 ×2」的收敛点）：
 * list 搜索防抖与 form 草稿防抖共用本实现；blocks/宿主如需防抖同样从这里取。
 * 返回的可调用对象附带 `cancel()`（丢弃 pending 定时器，form clearDraft 依赖它防止
 * 已清空的草稿被在途防抖写回）。callback 经 ref 取最新值，无需进依赖。
 */
export interface DebouncedCallback<A extends unknown[]> {
  /** 防抖调用：每次调用重置计时器，只有最后一次在 delayMs 后生效 */
  (...args: A): void;
  /** 丢弃 pending 调用（不影响后续新的防抖调用） */
  cancel(): void;
}

export function useDebouncedCallback<A extends unknown[]>(
  callback: (...args: A) => void,
  delayMs: number,
): DebouncedCallback<A> {
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  // 卸载清理（防定时器泄漏/在途回调打到已卸载组件）
  useEffect(() => {
    return () => {
      if (timerRef.current !== undefined) clearTimeout(timerRef.current);
    };
  }, []);

  const debounced = useCallback(
    (...args: A) => {
      if (timerRef.current !== undefined) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = undefined;
        callbackRef.current(...args);
      }, delayMs);
    },
    [delayMs],
  );

  const cancel = useCallback(() => {
    if (timerRef.current !== undefined) {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  const callable = debounced as DebouncedCallback<A>;
  callable.cancel = cancel;
  return callable;
}
