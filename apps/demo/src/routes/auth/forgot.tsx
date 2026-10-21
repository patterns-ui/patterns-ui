import { createFileRoute, Link } from "@tanstack/react-router";
import { ForgotPasswordPage } from "@/components/blocks/auth/forgot-password-page/forgot-password-page";

function ForgotPasswordRoute() {
  return (
    <ForgotPasswordPage
      brand={
        <div className="flex items-center gap-2 py-1">
          <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg text-sm font-bold">
            F
          </span>
          <span className="text-[15px] font-semibold">Fleetly Console</span>
        </div>
      }
      // demo：无真实邮件端点，模拟 600ms 延迟后进入发送成功态
      onSubmit={async () => {
        await new Promise((resolve) => setTimeout(resolve, 600));
      }}
      footer={
        <Link to="/auth/sign-in" className="text-muted-foreground hover:text-foreground">
          返回登录
        </Link>
      }
    />
  );
}

export const Route = createFileRoute("/auth/forgot")({
  component: ForgotPasswordRoute,
});
