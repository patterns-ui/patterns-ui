import { cn } from "cn";
import { LoaderCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useRef, useState } from "react";
import { AuthCardLayout } from "@/components/blocks/auth/auth-card-layout/auth-card-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface OtpPageProps {
  /** 校验码长度（分格数），默认 6 */
  length?: number;
  /** 全部填满时自动提交；也可点击按钮提交 */
  onSubmit: (code: string) => Promise<void>;
  title?: string;
  description?: string;
  brand?: ReactNode;
  footer?: ReactNode;
}

/**
 * 验证码 / MFA 页：N 位分格输入（自动进格、退格回跳、粘贴整段填充、填满自动提交；
 * 卡片壳见 AuthCardLayout）。
 */
export function OtpPage({
  length = 6,
  onSubmit,
  title = "输入验证码",
  description = "验证码已发送至你的邮箱或手机",
  brand,
  footer,
}: OtpPageProps) {
  const [digits, setDigits] = useState<string[]>(() => Array.from({ length }, () => ""));
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const inputsRef = useRef<Array<HTMLInputElement | null>>([]);

  const code = digits.join("");

  async function submit(value: string) {
    setError(null);
    setPending(true);
    try {
      await onSubmit(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : "验证失败，请重试");
      setDigits(Array.from({ length }, () => ""));
      inputsRef.current[0]?.focus();
    } finally {
      setPending(false);
    }
  }

  function setDigit(index: number, raw: string) {
    const value = raw.replace(/\D/g, "");
    if (value === "") {
      return;
    }
    setDigits((prev) => {
      const next = [...prev];
      // 支持一次输入/粘贴多位：从当前格起依次填充
      for (let offset = 0; offset < value.length && index + offset < length; offset++) {
        next[index + offset] = value[offset] ?? "";
      }
      const filled = next.join("");
      if (filled.length === length && !next.includes("")) {
        queueMicrotask(() => {
          const target = inputsRef.current[Math.min(index + value.length, length - 1)];
          target?.blur();
          void submit(filled);
        });
      }
      return next;
    });
    const focusIndex = Math.min(index + value.length, length - 1);
    inputsRef.current[focusIndex]?.focus();
  }

  function handleKeyDown(index: number, event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Backspace") {
      event.preventDefault();
      setDigits((prev) => {
        const next = [...prev];
        if (next[index]) {
          next[index] = "";
        } else if (index > 0) {
          next[index - 1] = "";
          inputsRef.current[index - 1]?.focus();
        }
        return next;
      });
    }
    if (event.key === "ArrowLeft" && index > 0) {
      inputsRef.current[index - 1]?.focus();
    }
    if (event.key === "ArrowRight" && index < length - 1) {
      inputsRef.current[index + 1]?.focus();
    }
  }

  return (
    <AuthCardLayout title={title} description={description} brand={brand} footer={footer}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (code.length === length && !code.includes("")) {
            void submit(code);
          }
        }}
        className="flex flex-col items-center gap-4"
      >
        <fieldset className="flex gap-2" aria-label={`${length} 位验证码`}>
          {digits.map((digit, index) => (
            <Input
              key={index}
              ref={(el) => {
                inputsRef.current[index] = el;
              }}
              inputMode="numeric"
              autoComplete={index === 0 ? "one-time-code" : "off"}
              maxLength={length}
              value={digit}
              autoFocus={index === 0}
              disabled={pending}
              aria-label={`第 ${index + 1} 位验证码`}
              className={cn(
                "size-11 text-center text-base font-medium tabular-nums",
                error && "aria-invalid:border-destructive",
              )}
              onChange={(e) => setDigit(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
            />
          ))}
        </fieldset>
        {error ? (
          <p role="alert" className="text-destructive text-sm">
            {error}
          </p>
        ) : null}
        <Button type="submit" className="w-full" disabled={pending || code.includes("")}>
          {pending ? <LoaderCircle className="animate-spin" data-icon="inline-start" /> : null}
          {pending ? "验证中…" : "验证"}
        </Button>
      </form>
    </AuthCardLayout>
  );
}
