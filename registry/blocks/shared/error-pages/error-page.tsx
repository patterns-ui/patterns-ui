import { cn } from "cn";
import { Lock, type LucideIcon, SearchX, ServerCrash } from "lucide-react";
import type { ReactNode } from "react";
import { PageHeader } from "@/components/blocks/shared/page-header/page-header";

/**
 * 错误页单模板（M6-D 参数化收敛）：403/404/500 三页的平行模板收敛为
 * code + 变体映射表（icon / 标题 / 默认文案 / 图标 tone）；未知 code 按 500 处理。
 */

export type ErrorPageStatus = 403 | 404 | 500;

interface ErrorPagePreset {
  title: string;
  message: ReactNode;
  icon: LucideIcon;
  iconWrap: string;
}

const ERROR_PRESETS: Record<ErrorPageStatus, ErrorPagePreset> = {
  403: {
    title: "没有权限",
    message: "你的账号没有访问此页面的权限。如需开通请联系管理员。",
    icon: Lock,
    iconWrap: "bg-status-warning-bg text-status-warning",
  },
  404: {
    title: "找不到页面",
    message: "页面不存在或已被移动。检查地址是否输入正确。",
    icon: SearchX,
    iconWrap: "bg-muted text-muted-foreground",
  },
  500: {
    title: "服务端错误",
    message: "服务器开小差了，请稍后重试。",
    icon: ServerCrash,
    iconWrap: "bg-status-danger-bg text-status-danger",
  },
};

export interface ErrorPageProps {
  /** HTTP 状态码（403/404 分档，其余含未知按 500；缺省 500） */
  code?: number | string;
  /** 覆盖默认标题 */
  title?: string;
  /** 覆盖默认描述文案 */
  message?: ReactNode;
  /** 动作区（返回链接 / 重试按钮等，由宿主传入） */
  action?: ReactNode;
}

/** code → 分档变体（未知 code 归 500） */
export function errorStatus(code: number | string | undefined): ErrorPageStatus {
  if (code === 403) return 403;
  if (code === 404) return 404;
  return 500;
}

/** 全屏错误页：状态码大字 + tone 图标 + 标题/描述 + 动作区 */
export function ErrorPage({ code, title, message, action }: ErrorPageProps) {
  const status = errorStatus(code);
  const preset = ERROR_PRESETS[status];
  const Icon = preset.icon;
  return (
    <main
      className="bg-background flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center"
      data-slot="error-page"
      data-status={status}
    >
      <p className="text-primary text-[64px] leading-none font-semibold tabular-nums">
        {code ?? status}
      </p>
      <div className={cn("flex size-11 items-center justify-center rounded-full", preset.iconWrap)}>
        <Icon className="size-5" />
      </div>
      <PageHeader
        title={title ?? preset.title}
        description={message ?? preset.message}
        className="max-w-md"
      />
      {action ? <div className="mt-2">{action}</div> : null}
    </main>
  );
}
