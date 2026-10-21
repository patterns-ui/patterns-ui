import { useEffect, useState } from "react";

/**
 * `useMounted()` 惯例 helper（architecture.md §6）：
 * core 内所有依赖浏览器 API（localStorage / document 等）的读取都收敛在 effect / 事件内，
 * 需要「服务端渲染安全的条件分支」时用本 hook 判断已挂载后再渲染浏览器专属内容。
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  return mounted;
}
