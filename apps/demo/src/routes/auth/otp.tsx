/** 页面配置迁移（M7-A3 批3）：结构在 pages/auth.page.ts，本文件是薄胶水（完成跳转接线）。 */
import { PageRenderer } from "@patterns-ui/core/page";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { makeOtpSubmit, otpPage } from "@/pages/otp.page";
import { authFlowTable } from "@/pages/tables";

function OtpRoute() {
  const navigate = useNavigate();
  return (
    <PageRenderer
      page={otpPage}
      table={authFlowTable}
      data={{
        host: { onSubmit: makeOtpSubmit({ navigate: (to) => navigate({ to: to as never }) }) },
      }}
    />
  );
}

export const Route = createFileRoute("/auth/otp")({
  component: OtpRoute,
});
