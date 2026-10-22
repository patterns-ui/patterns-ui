import { CircleCheck, LoaderCircle, Mail } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import {
  AuthBrandMark,
  type AuthBrandSpec,
  AuthCardLayout,
  AuthFooterLinks,
  type AuthFooterSpec,
} from "@/components/blocks/auth/auth-card-layout/auth-card-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export interface ForgotPasswordPageProps {
  onSubmit: (email: string) => Promise<void>;
  title?: string;
  description?: string;
  brand?: ReactNode | AuthBrandSpec;
  footer?: ReactNode | AuthFooterSpec;
}

/**
 * 忘记密码页：提交邮箱后进入「发送成功」终态（不暴露邮箱是否存在；
 * 卡片壳见 AuthCardLayout）。
 */

/** brand/footer 归一化：ReactNode 原样；数据形态（definePage 配置）渲染为标准品牌行/链接行 */
function normalizeAuthSlot(
  value: ReactNode | AuthBrandSpec | AuthFooterSpec | undefined,
): ReactNode {
  if (value === undefined || value === null) return value;
  if (typeof value === "object" && "name" in value && typeof value.name === "string") {
    return <AuthBrandMark spec={value} />;
  }
  if (typeof value === "object" && "links" in value && Array.isArray(value.links)) {
    return <AuthFooterLinks spec={value} />;
  }
  return value as ReactNode;
}

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
    <AuthCardLayout
      title={title}
      description={description}
      brand={normalizeAuthSlot(brand)}
      footer={normalizeAuthSlot(footer)}
    >
      {sent ? (
        <div className="flex flex-col items-center gap-3 py-4 text-center">
          <span className="bg-status-info-bg text-status-info flex size-10 items-center justify-center rounded-full">
            <Mail className="size-5" />
          </span>
          <CircleCheck className="text-status-success size-5" />
          <p className="text-sm text-muted-foreground">
            如果该邮箱已注册，重置链接已发送至 <span className="text-foreground">{email}</span>。
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
            {pending ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : null}
            {pending ? "发送中…" : "发送重置链接"}
          </Button>
        </form>
      )}
    </AuthCardLayout>
  );
}
