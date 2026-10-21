import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { OtpPage } from "@/components/blocks/auth/otp-page/otp-page";

function OtpRoute() {
  const navigate = useNavigate();
  return (
    <OtpPage
      brand={
        <div className="flex items-center gap-2 py-1">
          <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg text-sm font-bold">
            F
          </span>
          <span className="text-[15px] font-semibold">Fleetly Console</span>
        </div>
      }
      // demo：任意 6 位验证码均通过
      onSubmit={async () => {
        await new Promise((resolve) => setTimeout(resolve, 500));
        await navigate({ to: "/" });
      }}
      footer={
        <Link to="/auth/sign-in" className="text-muted-foreground hover:text-foreground">
          使用其它方式登录
        </Link>
      }
    />
  );
}

export const Route = createFileRoute("/auth/otp")({
  component: OtpRoute,
});
