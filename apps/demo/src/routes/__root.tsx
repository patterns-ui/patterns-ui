/**
 * 【M7-A3 豁免清单】根布局路由：Outlet + Toaster + notFound/error 边界，无页面原型归属。
 */
import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { ErrorPage } from "@/components/blocks/shared/error-pages/error-page";
import { RouteErrorBoundary } from "@/components/blocks/shared/error-pages/route-error-boundary";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";

export const Route = createRootRoute({
  component: () => (
    <>
      <Outlet />
      <Toaster position="bottom-right" />
    </>
  ),
  notFoundComponent: () => (
    <ErrorPage
      code={404}
      action={
        <Button size="sm" render={<Link to="/" />}>
          返回首页
        </Button>
      }
    />
  ),
  errorComponent: ({ error, reset }) => <RouteErrorBoundary error={error} reset={reset} />,
});
