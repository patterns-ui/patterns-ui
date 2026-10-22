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
