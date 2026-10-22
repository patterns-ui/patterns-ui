import { type HttpErrorKind, parseError } from "@patterns-ui/core/data";
import {
  Ban,
  KeyRound,
  Lock,
  type LucideIcon,
  RefreshCw,
  SearchX,
  ServerCrash,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";

export interface ErrorStateCopy {
  kind: HttpErrorKind | "network" | "unknown";
  title: string;
  description: string;
}

const copyTable: Record<
  ErrorStateCopy["kind"],
  { title: string; description: string; icon: LucideIcon }
> = {
  unauthorized: { title: "未登录或登录已过期", description: "请重新登录后继续。", icon: KeyRound },
  forbidden: {
    title: "没有权限访问",
    description: "你的账号没有执行此操作的权限，请联系管理员。",
    icon: Lock,
  },
  "not-found": { title: "内容不存在", description: "请求的资源不存在或已被删除。", icon: SearchX },
  conflict: {
    title: "数据冲突",
    description: "记录已被他人修改，请刷新后重试。",
    icon: TriangleAlert,
  },
  server: { title: "服务端错误", description: "服务器开小差了，请稍后重试。", icon: ServerCrash },
  network: {
    title: "网络错误",
    description: "无法连接到服务器，请检查网络后重试。",
    icon: WifiOff,
  },
  unknown: { title: "出错了", description: "发生意外错误，请重试。", icon: TriangleAlert },
  other: { title: "请求失败", description: "请求未能完成，请重试。", icon: Ban },
};

function copyEntry(kind: ErrorStateCopy["kind"]) {
  return (
    copyTable[kind] ??
    copyTable.unknown ?? {
      title: "出错了",
      description: "发生意外错误，请重试。",
      icon: TriangleAlert,
    }
  );
}

/**
 * HttpError 分档文案（401/403/404/409/5xx/网络/未知）。分档 kind 的信封解析走 core
 * parseError 单源（M7-A2：problem+json/{code,message}/裸状态码/字段错误数组归一）；
 * 本块的文案映射表保留（分档 → 文案/icon 是 UI 面）。
 */
export function errorStateCopy(error: unknown): ErrorStateCopy {
  const parsed = parseError(error);
  const entry = copyEntry(parsed.kind);
  return { kind: parsed.kind, title: entry.title, description: entry.description };
}

export interface ErrorStateProps {
  error?: unknown;
  onRetry?: () => void;
  retryLabel?: string;
  /** 额外动作（如「返回首页」） */
  action?: ReactNode;
  className?: string;
}

/** 错误态：按 HttpError 分档文案 + 重试 */
export function ErrorState({
  error,
  onRetry,
  retryLabel = "重试",
  action,
  className,
}: ErrorStateProps) {
  const copy = errorStateCopy(error);
  const Icon = copyEntry(copy.kind).icon;
  const status = error !== undefined ? parseError(error).status : undefined;

  return (
    <div
      role="alert"
      data-slot="error-state"
      className={`flex flex-col items-center justify-center gap-3 px-6 py-16 text-center ${className ?? ""}`}
    >
      <div className="bg-status-danger-bg text-status-danger flex size-11 items-center justify-center rounded-full">
        <Icon className="size-5" />
      </div>
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">{copy.title}</p>
        <p className="text-muted-foreground max-w-sm text-[13px]">{copy.description}</p>
      </div>
      {status !== undefined && status > 0 ? (
        <p className="text-muted-foreground/70 font-mono text-xs">HTTP {status}</p>
      ) : null}
      {onRetry || action ? (
        <div className="mt-2 flex items-center gap-2">
          {onRetry ? (
            <Button variant="outline" size="sm" onClick={onRetry}>
              <RefreshCw data-icon="inline-start" />
              {retryLabel}
            </Button>
          ) : null}
          {action}
        </div>
      ) : null}
    </div>
  );
}
