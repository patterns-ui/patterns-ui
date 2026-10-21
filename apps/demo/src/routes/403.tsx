import { createFileRoute, Link } from "@tanstack/react-router";
import { Error403 } from "@/components/blocks/shared/error-pages/error-403";
import { Button } from "@/components/ui/button";

/** /403：requireRole 守卫的重定向目标 */
export const Route = createFileRoute("/403")({
  component: () => (
    <Error403
      action={
        <Button size="sm" render={<Link to="/" />}>
          返回首页
        </Button>
      }
    />
  ),
});
