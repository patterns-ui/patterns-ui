import { cn } from "cn";
import { ArrowLeft, ArrowRight, Check, Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/button";

export interface StepperStep {
  title: string;
  description?: string;
  /** 步骤内容（最后一步可放 summary） */
  content: ReactNode;
  /**
   * 「下一步 / 完成」前校验：返回错误文案数组（空数组/undefined = 通过）；
   * 可异步（返回 Promise）。
   */
  validate?: () => string[] | undefined | Promise<string[] | undefined>;
}

export interface StepperProps {
  steps: StepperStep[];
  /** 全部步骤通过后触发（完成） */
  onComplete: () => void | Promise<void>;
  /** 完成按钮 pending 态 */
  pending?: boolean;
  nextLabel?: string;
  doneLabel?: string;
  className?: string;
}

/**
 * 分步向导：步骤指示（done/current/waiting 三态）+ 每步「下一步」前校验 +
 * 错误提示 + 上一步回退 + 完成回调。summary 由最后一步的 content 提供。
 */
export function Stepper({
  steps,
  onComplete,
  pending = false,
  nextLabel = "下一步",
  doneLabel = "完成",
  className,
}: StepperProps) {
  const [index, setIndex] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);
  const [validating, setValidating] = useState(false);
  const step = steps[index];
  const isLast = index === steps.length - 1;

  async function goNext(): Promise<void> {
    if (!step) return;
    setValidating(true);
    let problems: string[] | undefined;
    try {
      problems = await step.validate?.();
    } finally {
      setValidating(false);
    }
    if (problems && problems.length > 0) {
      setErrors(problems);
      return;
    }
    setErrors([]);
    if (isLast) {
      await onComplete();
      return;
    }
    setIndex((i) => Math.min(i + 1, steps.length - 1));
  }

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      {/* 步骤指示器 */}
      <ol className="flex flex-wrap items-center gap-2">
        {steps.map((s, i) => {
          const state = i < index ? "done" : i === index ? "current" : "waiting";
          return (
            <li key={s.title} className="flex items-center gap-2">
              <span
                aria-current={state === "current" ? "step" : undefined}
                className={cn(
                  "flex size-6 items-center justify-center rounded-full border text-xs font-medium",
                  state === "done" &&
                    "border-status-success/40 bg-status-success-bg text-status-success",
                  state === "current" && "border-primary bg-primary text-primary-foreground",
                  state === "waiting" && "text-muted-foreground border-border",
                )}
              >
                {state === "done" ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span
                className={cn(
                  "text-sm",
                  state === "current" ? "font-medium" : "text-muted-foreground",
                )}
              >
                {s.title}
              </span>
              {i < steps.length - 1 ? (
                <span aria-hidden="true" className="bg-border mx-1 h-px w-6 sm:w-10" />
              ) : null}
            </li>
          );
        })}
      </ol>

      {/* 当前步内容（含 summary） */}
      <div className="min-h-0 flex-1">
        {step ? (
          <div className="flex flex-col gap-4">
            {step.description ? (
              <p className="text-muted-foreground text-sm">{step.description}</p>
            ) : null}
            {step.content}
          </div>
        ) : null}
      </div>

      {/* 校验错误 */}
      {errors.length > 0 ? (
        <div role="alert" className="text-destructive space-y-1 text-sm">
          {errors.map((message) => (
            <p key={message}>· {message}</p>
          ))}
        </div>
      ) : null}

      {/* 导航 */}
      <div className="flex items-center justify-between">
        <Button
          type="button"
          variant="ghost"
          disabled={index === 0 || validating || pending}
          onClick={() => {
            setErrors([]);
            setIndex((i) => Math.max(0, i - 1));
          }}
        >
          <ArrowLeft /> 上一步
        </Button>
        <Button
          type="button"
          disabled={validating || pending}
          onClick={() => {
            void goNext();
          }}
        >
          {validating || pending ? <Loader2 className="animate-spin" /> : null}
          {isLast ? doneLabel : nextLabel}
          {isLast ? null : <ArrowRight />}
        </Button>
      </div>
    </div>
  );
}
