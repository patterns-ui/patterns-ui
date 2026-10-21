import { createRootRoute, Link, Outlet } from "@tanstack/react-router";
import { Error404 } from "@/components/blocks/shared/error-pages/error-404";
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
    <Error404
      action={
        <Button size="sm" render={<Link to="/" />}>
          返回首页
        </Button>
      }
    />
  ),
  errorComponent: ({ error, reset }) => <RouteErrorBoundary error={error} reset={reset} />,
});
