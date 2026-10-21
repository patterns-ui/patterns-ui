import { LoaderCircle } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface SignInPageProps {
  onSubmit: (credentials: { email: string; password: string }) => Promise<void>;
  title?: string;
  description?: string;
  /** 品牌位（logo + 产品名），渲染在表单上方 */
  brand?: ReactNode;
  /** 表单下方区域（注册 / 忘记密码链接等） */
  footer?: ReactNode;
  submitLabel?: string;
}

/**
 * 登录页：品牌位 + 邮箱密码表单 + 错误展示。
 * onSubmit 抛错 → 表单内联展示（如 HttpError(401) 的「邮箱或密码错误」）；next 回跳由宿主处理。
 */
export function SignInPage({
  onSubmit,
  title = "欢迎回来",
  description = "登录你的账号以继续",
  brand,
  footer,
  submitLabel = "登录",
}: SignInPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await onSubmit({ email, password });
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败，请重试");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="bg-background flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader className="items-center text-center">
          {brand}
          <CardTitle className="text-[22px] font-semibold tracking-tight">{title}</CardTitle>
          {description ? <CardDescription>{description}</CardDescription> : null}
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="grid gap-2">
              <Label htmlFor="signin-email">邮箱</Label>
              <Input
                id="signin-email"
                type="email"
                autoComplete="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="signin-password">密码</Label>
              <Input
                id="signin-password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {error ? (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={pending} className="w-full">
              {pending ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : null}
              {pending ? "登录中…" : submitLabel}
            </Button>
          </form>
        </CardContent>
        {footer ? <CardFooter className="justify-center text-sm">{footer}</CardFooter> : null}
      </Card>
    </main>
  );
}
