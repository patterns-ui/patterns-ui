import { CircleCheck, LoaderCircle } from "lucide-react";
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

export interface SignUpPageProps {
  onSubmit: (values: { name: string; email: string; password: string }) => Promise<void>;
  title?: string;
  description?: string;
  brand?: ReactNode | AuthBrandSpec;
  footer?: ReactNode | AuthFooterSpec;
}

/**
 * 注册页：姓名 + 邮箱 + 密码 + 确认密码（客户端一致性校验；卡片壳见 AuthCardLayout）。
 * 提交成功后由宿主切换 success 视图或直接登录。
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

export function SignUpPage({
  onSubmit,
  title = "创建账号",
  description = "几秒钟完成注册",
  brand,
  footer,
}: SignUpPageProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("两次输入的密码不一致");
      return;
    }
    setPending(true);
    try {
      await onSubmit({ name, email, password });
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "注册失败，请重试");
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
      {done ? (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <CircleCheck className="text-status-success size-8" />
          <p className="text-sm text-muted-foreground">注册成功，请查收验证邮件完成激活。</p>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="grid gap-2">
            <Label htmlFor="signup-name">姓名</Label>
            <Input
              id="signup-name"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="signup-email">邮箱</Label>
            <Input
              id="signup-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="signup-password">密码</Label>
            <Input
              id="signup-password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="signup-confirm">确认密码</Label>
            <Input
              id="signup-confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </div>
          {error ? (
            <p role="alert" className="text-destructive text-sm">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={pending} className="w-full">
            {pending ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : null}
            {pending ? "提交中…" : "创建账号"}
          </Button>
        </form>
      )}
    </AuthCardLayout>
  );
}
