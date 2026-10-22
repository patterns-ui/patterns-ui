import { useAuth } from "@fleetly/ui-component-core/auth";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { SignInPage } from "@/components/blocks/auth/sign-in-page/sign-in-page";

function validateSignInSearch(search: Record<string, unknown>): { next?: string } {
  return { next: typeof search.next === "string" ? search.next : undefined };
}

function SignInRoute() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const { next } = Route.useSearch();

  return (
    <SignInPage
      brand={
        <div className="flex items-center gap-2 py-1">
          <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-lg text-sm font-bold">
            F
          </span>
          <span className="text-[15px] font-semibold">Fleetly Console</span>
        </div>
      }
      description="测试账号：demo@fleetly.dev，密码任意"
      onSubmit={async (credentials) => {
        await login(credentials);
        await navigate({ to: (next ?? "/") as never });
      }}
      footer={
        <div className="flex items-center gap-4">
          <Link to="/auth/forgot" className="text-muted-foreground hover:text-foreground">
            忘记密码？
          </Link>
          <Link to="/auth/sign-up" className="text-primary hover:underline">
            注册账号
          </Link>
        </div>
      }
    />
  );
}

export const Route = createFileRoute("/auth/sign-in")({
  validateSearch: validateSignInSearch,
  component: SignInRoute,
});
