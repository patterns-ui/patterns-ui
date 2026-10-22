/**
 * page/actions —— action 封闭词表（M7-A2 初版 10 个，只追加不改名）。
 *
 * 形态与 /vocab 一致（paradigm §3.3 (2)）：as const 元组 + 派生联合——报错信息展开全部
 * 合法值（报错信息即目录）；逐名 JSDoc + ACTION_DOCS 描述映射。
 * 语义与副作用执行器由宿主注入（core 不绑 router/toast 实现）：navigate 走 TanStack Router
 * 抽象层（useActionExecutor 内 try/catch 降级，同 list 模块 useRouterAccess 手法）、
 * toast 走注入回调，其余动作位宿主可经 execute 覆盖。
 */
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

/** action 名字表（封闭词表；只追加） */
export const ACTION_NAMES = [
  /** 路由导航：to 为目标路径（TanStack Router 抽象层执行；replace 缺省 false）。 */
  "navigate",
  /** 轻提示：宿主注入 toast 执行器（如 sonner）；variant 缺省 info。 */
  "toast",
  /** 刷新当前查询（宿主语义：当前视图 refetch；无 payload）。 */
  "refresh",
  /** 失效缓存：key = queryKey 工厂产物（listKeyPrefix/detailKeyPrefix 等，前缀匹配）。 */
  "invalidate",
  /** 主动重取：key 缺省 = 当前查询（与 refresh 的区别：可指定目标 key）。 */
  "refetch",
  /** 关闭宿主容器（dialog/sheet/peek；无 payload）。 */
  "close",
  /** 整页重载（window.location.reload；无 payload）。 */
  "reload",
  /** 写剪贴板：value 为待复制文本。 */
  "copy",
  /** 等待态对话框：title/description/minMs（异步任务期间的最小时长遮罩）。 */
  "waitDialog",
  /** 全局 loading 开关：on = 显/隐（宿主进度指示位）。 */
  "loading",
] as const;

/** action 封闭词表：写错名字由 typecheck 报错并列出全部合法值（报错信息即目录） */
export type ActionName = (typeof ACTION_NAMES)[number];

/** action 描述映射（供 patterns.md/AGENTS.md 生成器与 ui:check 工具消费） */
export const ACTION_DOCS: Record<ActionName, string> = {
  navigate: "路由导航：to 为目标路径（TanStack Router 抽象层执行；replace 缺省 false）。",
  toast: "轻提示：宿主注入 toast 执行器（如 sonner）；variant 缺省 info。",
  refresh: "刷新当前查询（宿主语义：当前视图 refetch；无 payload）。",
  invalidate: "失效缓存：key = queryKey 工厂产物（listKeyPrefix/detailKeyPrefix 等，前缀匹配）。",
  refetch: "主动重取：key 缺省 = 当前查询（与 refresh 的区别：可指定目标 key）。",
  close: "关闭宿主容器（dialog/sheet/peek；无 payload）。",
  reload: "整页重载（window.location.reload；无 payload）。",
  copy: "写剪贴板：value 为待复制文本。",
  waitDialog: "等待态对话框：title/description/minMs（异步任务期间的最小时长遮罩）。",
  loading: "全局 loading 开关：on = 显/隐（宿主进度指示位）。",
};

/** 每个动作的类型化 payload（判别联合的 payload 面） */
export interface ActionPayloadMap {
  navigate: { to: string; replace?: boolean };
  toast: { message: string; variant?: "success" | "error" | "info" | "warning" };
  refresh: Record<string, never>;
  invalidate: { key: readonly unknown[] };
  refetch: { key?: readonly unknown[] };
  close: Record<string, never>;
  reload: Record<string, never>;
  copy: { value: string };
  waitDialog: { title?: string; description?: string; minMs?: number };
  loading: { on: boolean };
}

/** 声明式动作（判别联合：name 收窄 payload；词表外名字编译期拒绝） */
export type Action = {
  [K in ActionName]: { name: K; payload: ActionPayloadMap[K] };
}[ActionName];

/** 动作执行上下文（flow/page 数据等；宿主可扩展） */
export interface ActionContext {
  data?: Record<string, unknown>;
}

/** 动作副作用执行器：语义由宿主注入（core 只编排与校验词表） */
export type ActionExecutor = (action: Action, ctx: ActionContext) => void | Promise<void>;

/**
 * 词表外动作名 → 运行期拒绝（报错列 ACTION_NAMES 全表——与 A1 报错即目录同哲学）。
 * 编译期由 Action 判别联合拒绝（单测以 as never 模拟 JS 消费方触发运行期路径）。
 */
export function assertActionName(name: unknown): asserts name is ActionName {
  if (typeof name === "string" && (ACTION_NAMES as readonly string[]).includes(name)) return;
  throw new Error(
    `未知 action「${String(name)}」；合法值：[${ACTION_NAMES.join(", ")}]（action 词表只追加，见 core-api.md §17.5）`,
  );
}

/** 按声明序执行动作序列（逐个过词表校验；执行器异常向上传播） */
export async function runActions(
  actions: readonly Action[],
  execute: ActionExecutor,
  ctx: ActionContext = {},
): Promise<void> {
  for (const action of actions) {
    assertActionName(action.name);
    await execute(action, ctx);
  }
}

// ---------------------------------------------------------------------------
// 默认执行器骨架（core 不绑 router/toast 实现；宿主注入语义）
// ---------------------------------------------------------------------------

/** 默认执行器选项：toast 走注入回调；navigate 走 TanStack Router（无 Router 宿主时降级 no-op） */
export interface ActionExecutorOptions {
  toast?: (payload: ActionPayloadMap["toast"]) => void;
  /** 逐动作覆盖（refresh/invalidate/refetch/close/reload/copy/waitDialog/loading 的宿主语义） */
  execute?: Partial<Record<ActionName, ActionExecutor>>;
}

/**
 * 默认执行器骨架：navigate 经 TanStack Router 抽象层（useNavigate 无 Provider 时
 * try/catch 降级——与 list 模块 useRouterAccess 同手法）、toast 经注入回调、
 * reload 走 window.location；其余动作位为可覆盖 no-op（宿主经 execute 注入语义）。
 */
export function useActionExecutor(opts?: ActionExecutorOptions): ActionExecutor {
  // 与 useRouterAccess 同款降级：无 Router 宿主（嵌入场景）时 navigate 静默 no-op
  let navigate: ((to: string, replace?: boolean) => void) | undefined;
  try {
    // biome-ignore lint/correctness/useHookAtTopLevel: hook 位于 try 内是刻意的 —— 无 Router 宿主时安全降级；hook 调用顺序恒定
    const nav = useNavigate();
    navigate = (to: string, replace?: boolean) => {
      try {
        void nav({ to, replace, search: true } as Parameters<typeof nav>[0]);
      } catch {
        /* 无 Router 宿主：调用期降级（useNavigate 惰性读 context，缺失在调用时抛） */
      }
    };
  } catch {
    /* 无 Router 宿主 */
  }
  return useCallback(
    (action: Action, ctx: ActionContext) => {
      const override = opts?.execute?.[action.name];
      if (override) return override(action, ctx);
      switch (action.name) {
        case "navigate":
          navigate?.(action.payload.to, action.payload.replace);
          return;
        case "toast":
          opts?.toast?.(action.payload);
          return;
        case "reload":
          globalThis.location?.reload?.();
          return;
        // 宿主语义位：core 不绑实现（invalidate/refetch 的 queryClient、close 的容器、
        // copy 的剪贴板、waitDialog/loading 的指示器均由宿主经 execute 注入）
        case "refresh":
        case "invalidate":
        case "refetch":
        case "close":
        case "copy":
        case "waitDialog":
        case "loading":
          return;
      }
    },
    [opts, navigate],
  );
}
