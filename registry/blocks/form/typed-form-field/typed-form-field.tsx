/**
 * typed-form-field —— TanStack Form v1 组合工厂 + widget 注册（docs/blocks.md form/）。
 *
 * 用法（demo / 用户项目共用同一 contexts）：
 * ```tsx
 * const { useAppForm, withForm, SubmitButton, FormMessage } = createTypedForm()
 * const form = useAppForm({
 *   defaultValues,
 *   validators: { onChange: zodSchema },      // zod v4 Standard Schema 直传
 *   onSubmit: async ({ value, formApi }) => {
 *     const result = await resourceForm.onSubmit(value)   // core useResourceForm
 *     if (!result.ok) {
 *       formApi.setErrorMap({ onSubmit: { fields: result.fieldErrors, form: result.formError } })
 *     }
 *   },
 * })
 * <form onSubmit={(e) => { e.preventDefault(); void form.handleSubmit() }}>
 *   <form.AppForm>
 *     <form.AppField name="name">{(field) => <field.TextWidget label="名称" required />}</form.AppField>
 *   </form.AppForm>
 * </form>
 * ```
 */
import { createFormHook } from "@tanstack/react-form";
import { Loader2 } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import {
  collectFieldErrors,
  fieldContext,
  fieldMessage,
  formContext,
  useFormContext,
} from "./contexts";
import {
  type DateRangeValue,
  DateRangeWidget,
  DateWidget,
  JsonWidget,
  type KvPair,
  KvPairsWidget,
  MultiSelectWidget,
  NumberWidget,
  RepeatableRowsWidget,
  SecretWidget,
  SelectWidget,
  SwitchWidget,
  TagsWidget,
  TextareaWidget,
  TextWidget,
  type UploadedFile,
  UploadWidget,
} from "./widgets";

/** 内建字段 widget 全家（注册进 fieldComponents → field.<Widget> 直接可用） */
export const typedFieldComponents = {
  TextWidget,
  TextareaWidget,
  NumberWidget,
  SelectWidget,
  MultiSelectWidget,
  TagsWidget,
  SwitchWidget,
  DateWidget,
  DateRangeWidget,
  SecretWidget,
  KvPairsWidget,
  UploadWidget,
  JsonWidget,
  RepeatableRowsWidget,
} as const;

// ---------------------------------------------------------------------------
// 表单级组件（formComponents → form.SubmitButton / form.FormMessage）
// ---------------------------------------------------------------------------

/** 提交按钮：订阅 canSubmit/isSubmitting（校验不过禁用；提交中转圈） */
export function SubmitButton({
  label = "保存",
  pendingLabel = "保存中…",
  disabled,
}: {
  label?: ReactNode;
  pendingLabel?: ReactNode;
  disabled?: boolean;
}) {
  const form = useFormContext();
  return (
    <form.Subscribe
      selector={(s: { canSubmit: boolean; isSubmitting: boolean }) =>
        [s.canSubmit, s.isSubmitting] as const
      }
    >
      {([canSubmit, isSubmitting]: readonly [boolean, boolean]) => (
        <Button type="submit" disabled={disabled || isSubmitting || !canSubmit}>
          {isSubmitting ? <Loader2 className="animate-spin" /> : null}
          {isSubmitting ? pendingLabel : label}
        </Button>
      )}
    </form.Subscribe>
  );
}

/** 表单级错误/提示位（onSubmit setErrorMap 的 form 段 + onServer 时相） */
export function FormMessage() {
  const form = useFormContext();
  return (
    <form.Subscribe selector={(s: { errorMap: Record<string, unknown> }) => s.errorMap}>
      {(errorMap: Record<string, unknown>) => {
        const messages = collectFieldErrors({ errors: [], errorMap });
        if (messages.length === 0) return null;
        return (
          <div role="alert" className="text-destructive text-sm">
            {messages.join("；")}
          </div>
        );
      }}
    </form.Subscribe>
  );
}

export const typedFormComponents = { SubmitButton, FormMessage } as const;

// ---------------------------------------------------------------------------
// createTypedForm 工厂
// ---------------------------------------------------------------------------

export interface TypedFormEnv {
  /** 追加/覆盖字段 widget（如项目自有富文本编辑器） */
  fieldComponents?: Record<string, ComponentType<any>>;
  /** 追加/覆盖表单级组件 */
  formComponents?: Record<string, ComponentType<any>>;
}

/**
 * 组合 typed form：返回 createFormHook 全套（useAppForm / withForm / withFieldGroup /
 * useTypedAppFormContext / extendForm）。demo 与用户项目用同一 contexts → 字段上下文互通。
 */
export function createTypedForm(env: TypedFormEnv = {}) {
  return createFormHook({
    fieldContext,
    formContext,
    fieldComponents: { ...typedFieldComponents, ...env.fieldComponents },
    formComponents: { ...typedFormComponents, ...env.formComponents },
  });
}

/** 默认实例（demo 直接使用；多项目可 createTypedForm 自定义扩展） */
export const { useAppForm, withForm, extendForm } = createTypedForm();

// ---------------------------------------------------------------------------
// TypedField：component prop 风格的便利封装（v1.33 AppField 为 children render prop）
// ---------------------------------------------------------------------------

export interface TypedFieldProps {
  /** useAppForm 返回的表单实例 */
  // biome-ignore lint/suspicious/noExplicitAny: 表单实例松类型（AppField 泛型与具体表单绑定）
  form: any;
  name: string;
  /** widget 组件（如 TextWidget；或经 createTypedForm 扩展的自定义 widget） */
  component: ComponentType<any>;
  /** 透传给 widget 的 props（label/description/options…） */
  props?: Record<string, unknown>;
}

/**
 * `<TypedField form={form} name="env" component={SelectWidget} props={{ label: "环境", options }} />`
 * 等价 `<form.AppField name="env">{(field) => <field.SelectWidget label="环境" options={options} />}</form.AppField>`
 */
export function TypedField({ form, name, component, props }: TypedFieldProps) {
  const AppField: React.ComponentType<{
    name: string;
    children: (field: unknown) => ReactNode;
  }> = form.AppField;
  const Comp = component;
  return <AppField name={name}>{() => <Comp {...(props ?? {})} />}</AppField>;
}

// ---------------------------------------------------------------------------
// 条件显隐（visibleWhen）
// ---------------------------------------------------------------------------

export interface VisibleWhenProps {
  /** useAppForm 返回的表单实例 */
  // biome-ignore lint/suspicious/noExplicitAny: 表单实例松类型（Subscribe 泛型与具体表单绑定）
  form: any;
  /** 监听的字段名（支持嵌套 path） */
  watch: string;
  /** 值判定：true 才渲染 children */
  test: (value: unknown) => boolean;
  children: ReactNode;
}

/**
 * 条件显隐联动：`<VisibleWhen form={form} watch="env" test={(v) => v === "prod"}>…</VisibleWhen>`
 * （订阅字段值，不触发表单校验时相；隐藏字段仍在 form values 中 —— 需要「不提交隐藏值」
 * 由调用方在 onSubmit 映射时处理。）
 */
export function VisibleWhen({ form, watch, test, children }: VisibleWhenProps) {
  const Subscribe: React.ComponentType<{
    selector: (s: { values: Record<string, unknown> }) => unknown;
    children: (value: unknown) => ReactNode;
  }> = form.Subscribe;
  return (
    <Subscribe selector={(s) => readPath(s.values, watch)}>
      {(value) => (test(value) ? children : null)}
    </Subscribe>
  );
}

function readPath(values: Record<string, unknown>, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    if (Array.isArray(acc)) return acc[Number(key)];
    return (acc as Record<string, unknown>)[key];
  }, values);
}

export type { DateRangeValue, KvPair, UploadedFile };
export { collectFieldErrors, fieldMessage };
