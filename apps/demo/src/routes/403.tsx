/**
 * 【M7-A3 豁免清单】错误小页：ErrorPage 参数化变体（requireRole 守卫的重定向目标），
 * 不属七页面原型（error 是横切三态而非原型，paradigm §3.2），无法 definePage——保持手工装配。
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { ErrorPage } from "@/components/blocks/shared/error-pages/error-page";
import { Button } from "@/components/ui/button";

/** /403：requireRole 守卫的重定向目标 */
export const Route = createFileRoute("/403")({
  component: () => (
    <ErrorPage
      code={403}
      action={
        <Button size="sm" render={<Link to="/" />}>
          返回首页
        </Button>
      }
    />
  ),
});
