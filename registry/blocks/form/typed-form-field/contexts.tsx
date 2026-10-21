/**
 * typed-form-field 共享上下文与字段外壳（docs/blocks.md form/typed-form-field）。
 *
 * TanStack Form v1（@tanstack/react-form ^1.33）组合 API：
 * - `createFormHookContexts()` → { fieldContext, useFieldContext, useFormContext, formContext }
 * - `createFormHook({ fieldContext, formContext, fieldComponents, formComponents })`
 * - 字段渲染：`<form.AppField name="x">{(field) => <field.TextWidget />}</form.AppField>`
 *   （children render prop；field API 上合并了 fieldComponents，v1.33 无 component prop）
 * - 服务端错误：onSubmit 内 `formApi.setErrorMap({ onSubmit: { fields, form } })`
 *   （onSubmit 返回值在 v1.33 被忽略）
 */
import { createFormHookContexts } from "@tanstack/react-form";
import { cn } from "cn";
import { type ReactNode, useId } from "react";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@/components/ui/field";

export const { fieldContext, useFieldContext, useFormContext, formContext } =
  createFormHookContexts();

/** TanStack Form 错误值 → 文案（string | { message }） */
export function fieldMessage(error: unknown): string {
  if (error === undefined || error === null) return "";
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    if ("message" in error) {
      const message = (error as { message?: unknown }).message;
      if (typeof message === "string" && message !== "") return message;
    }
    if ("issues" in error && Array.isArray((error as { issues: unknown[] }).issues)) {
      const issues = (error as { issues: { message?: string }[] }).issues
        .map((i) => i?.message)
        .filter(Boolean);
      if (issues.length > 0) return issues.join("；");
    }
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error);
}

/**
 * 合并字段错误：meta.errors（聚合数组）优先；为空时回落 errorMap 各时相值
 * （服务端 setErrorMap 后 errors 数组可能尚未聚合，errorMap 永远在）。
 */
export function collectFieldErrors(meta: {
  errors: unknown[];
  errorMap: Record<string, unknown>;
}): string[] {
  const fromErrors = meta.errors.map(fieldMessage).filter(Boolean);
  if (fromErrors.length > 0) return fromErrors;
  return Object.values(meta.errorMap ?? {})
    .map(fieldMessage)
    .filter(Boolean);
}

export interface FieldShellProps {
  label?: ReactNode;
  description?: ReactNode;
  /** 错误文案列表（空 = 无错误显示） */
  errors?: string[];
  required?: boolean;
  /** 字段主体（受控输入） */
  children: ReactNode;
  /** 附加到 label 的 htmlFor */
  htmlFor?: string;
  className?: string;
  /** 行内布局（switch 等宽控件用） */
  inline?: boolean;
}

/** 统一字段布局：label / description / 控件 / error（required 加 *；错误态红色） */
export function FieldShell({
  label,
  description,
  errors,
  required,
  children,
  htmlFor,
  className,
  inline = false,
}: FieldShellProps) {
  const id = useId();
  return (
    <Field
      data-invalid={errors !== undefined && errors.length > 0 ? true : undefined}
      orientation={inline ? "horizontal" : "vertical"}
      className={cn("gap-2", className)}
    >
      {label ? (
        <FieldLabel htmlFor={htmlFor ?? id}>
          {label}
          {required ? (
            <span aria-hidden="true" className="text-destructive">
              *
            </span>
          ) : null}
        </FieldLabel>
      ) : null}
      <FieldContent>
        {children}
        {description ? <FieldDescription>{description}</FieldDescription> : null}
        <FieldError errors={errors?.map((message) => ({ message }))} />
      </FieldContent>
    </Field>
  );
}
