import { CircleCheck, LoaderCircle, Mail } from "lucide-react";
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

export interface ForgotPasswordPageProps {
  onSubmit: (email: string) => Promise<void>;
  title?: string;
  description?: string;
  brand?: ReactNode;
  footer?: ReactNode;
}

/**
 * 忘记密码页：提交邮箱后进入「发送成功」终态（不暴露邮箱是否存在）。
 */
export function ForgotPasswordPage({
  onSubmit,
  title = "重置密码",
  description = "输入注册邮箱，我们会发送重置链接",
  brand,
  footer,
}: ForgotPasswordPageProps) {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);
    try {
      await onSubmit(email);
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "发送失败，请重试");
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
          {sent ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <span className="bg-status-info-bg text-status-info flex size-10 items-center justify-center rounded-full">
                <Mail className="size-5" />
              </span>
              <CircleCheck className="text-status-success size-5" />
              <p className="text-sm text-muted-foreground">
                如果该邮箱已注册，重置链接已发送至 <span className="text-foreground">{email}</span>
                。
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div className="grid gap-2">
                <Label htmlFor="forgot-email">邮箱</Label>
                <Input
                  id="forgot-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              {error ? (
                <p role="alert" className="text-destructive text-sm">
                  {error}
                </p>
              ) : null}
              <Button type="submit" disabled={pending} className="w-full">
                {pending ? (
                  <LoaderCircle className="animate-spin" data-icon="inline-start" />
                ) : null}
                {pending ? "发送中…" : "发送重置链接"}
              </Button>
            </form>
          )}
        </CardContent>
        {footer ? <CardFooter className="justify-center text-sm">{footer}</CardFooter> : null}
      </Card>
    </main>
  );
}
