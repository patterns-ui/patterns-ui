import { createFileRoute, Link } from "@tanstack/react-router";
import { SignUpPage } from "@/components/blocks/auth/sign-up-page/sign-up-page";

function SignUpRoute() {
  return (
    <SignUpPage
      brand={
        <div className="flex items-center gap-2 py-1">
          <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg text-sm font-bold">
            F
          </span>
          <span className="text-[15px] font-semibold">Fleetly Console</span>
        </div>
      }
      // demo：无注册端点，模拟 600ms 提交后进入成功态
      onSubmit={async () => {
        await new Promise((resolve) => setTimeout(resolve, 600));
      }}
      footer={
        <div className="flex items-center gap-4">
          <span className="text-muted-foreground">已有账号？</span>
          <Link to="/auth/sign-in" className="text-primary hover:underline">
            直接登录
          </Link>
        </div>
      }
    />
  );
}

export const Route = createFileRoute("/auth/sign-up")({
  component: SignUpRoute,
});
