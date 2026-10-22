/** 页面配置迁移（M7-A3 批3）：结构在 pages/auth.page.ts，本文件是薄胶水（登录接线 + 渲染出口）。 */
import { useAuth } from "@patterns-ui/core/auth";
import { PageRenderer } from "@patterns-ui/core/page";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { makeSignInSubmit, signInPage } from "@/pages/sign-in.page";
import { authFlowTable } from "@/pages/tables";

function validateSignInSearch(search: Record<string, unknown>): { next?: string } {
  return { next: typeof search.next === "string" ? search.next : undefined };
}

function SignInRoute() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { next } = Route.useSearch();

  return (
    <PageRenderer
      page={signInPage}
      table={authFlowTable}
      data={{
        host: {
          onSubmit: makeSignInSubmit({
            login,
            navigate: (to) => navigate({ to: to as never }),
            next,
          }),
        },
      }}
    />
  );
}

export const Route = createFileRoute("/auth/sign-in")({
  validateSearch: validateSignInSearch,
  component: SignInRoute,
});
