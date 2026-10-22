/** 页面配置迁移（M7-A3 批3）：结构在 pages/auth.page.ts，本文件是薄胶水（渲染出口）。 */
import { PageRenderer } from "@patterns-ui/core/page";
import { createFileRoute } from "@tanstack/react-router";
import { makeFakeSubmit, signUpPage } from "@/pages/sign-up.page";
import { authFlowTable } from "@/pages/tables";

function SignUpRoute() {
  return (
    <PageRenderer
      page={signUpPage}
      table={authFlowTable}
      data={{ host: { onSubmit: makeFakeSubmit(600) } }}
    />
  );
}

export const Route = createFileRoute("/auth/sign-up")({
  component: SignUpRoute,
});
