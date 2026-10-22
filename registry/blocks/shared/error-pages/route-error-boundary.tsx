import { HttpError } from "@fleetly/patterns-ui-core/data";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Error403 } from "./error-403";
import { Error404 } from "./error-404";
import { Error500 } from "./error-500";

export interface RouteErrorBoundaryProps {
  error: unknown;
  /** router 的 reset（重试当前路由） */
  reset?: () => void;
}

function errorStatus(error: unknown): number | undefined {
  if (error instanceof HttpError) {
    return error.status;
  }
  if (typeof error === "object" && error !== null && "status" in error) {
    const status = Number((error as { status: unknown }).status);
    return Number.isNaN(status) ? undefined : status;
  }
  return undefined;
}

function defaultMessage(error: unknown): ReactNode {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return undefined;
}

/**
 * 路由级错误边界（TanStack Router errorComponent / defaultErrorComponent 适配）：
 * HttpError 403/404 分档渲染对应页面，其余（含 5xx 与未知）渲染 500 + 错误信息 + 重试。
 */
export function RouteErrorBoundary({ error, reset }: RouteErrorBoundaryProps) {
  const status = errorStatus(error);
  const actions = (
    <div className="flex items-center gap-2">
      {reset ? (
        <Button variant="outline" size="sm" onClick={reset}>
          <RefreshCw data-icon="inline-start" />
          重试
        </Button>
      ) : null}
      <Button size="sm" render={<Link to="/" />}>
        <ArrowLeft data-icon="inline-start" />
        返回首页
      </Button>
    </div>
  );

  if (status === 403) {
    return <Error403 message={defaultMessage(error)} action={actions} />;
  }
  if (status === 404) {
    return <Error404 message={defaultMessage(error)} action={actions} />;
  }
  return <Error500 message={defaultMessage(error) ?? undefined} action={actions} />;
}
