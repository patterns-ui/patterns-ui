/**
 * core/form —— useResourceForm + useFormDirtyGuard（docs/core-api.md §5）。
 *
 * core 只约定逻辑壳（宿主无关）：TanStack Form 绑定在 blocks 层 `typed-form-field`。
 * 草稿（`fc:draft:<resource>:<id|new>`）属偏好语义存 localStorage，读写收敛 effect/事件内。
 */
import { useBlocker, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { HttpError, type MutationOpts, type Resource } from "../data";
import { useMounted } from "../mounted";

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

/** 表单级校验 schema：zod v4（或任何 Standard Schema 实现）。core 只透传，绑定在 blocks 层 */
export type FormSchema = { readonly "~standard": unknown };

/** 草稿 key：`fc:draft:<resource>:<id|new>` */
export function draftKey(resourceName: string, id: string | undefined): string {
  return `fc:draft:${resourceName}:${id ?? "new"}`;
}

export interface FormAutosaveOptions {
  /** 默认 true（传入 autosave 对象即启用） */
  enabled?: boolean;
  /** 防抖写入间隔，默认 800ms */
  debounceMs?: number;
}

export interface UseResourceFormOptions<TData> {
  resource: Resource<TData, any, any>;
  /** 有值 = edit 模式（自动 useOne 取数填充） */
  id?: string;
  /** zod v4 直传（Standard Schema；由消费端绑进表单 validators） */
  schema: FormSchema;
  defaultValues: Partial<TData>;
  mutationMode?: MutationOpts<any>["mutationMode"];
  /** 提交成功后跳转：list（默认）回列表 / detail 回详情 / stay 留在本页；函数形态返回显式路径 */
  redirect?:
    | "list"
    | "detail"
    | "stay"
    | ((ctx: { mode: "create" | "edit"; data: TData }) => string);
  /** 草稿 localStorage：`fc:draft:<resource>:<id|new>` */
  autosave?: { enabled?: boolean; debounceMs?: number };
  submitText?: string;
  /** edit 提交携带的版本号来源（If-Match）；默认取 record.<versionField> */
  versionOf?: (record: TData) => string | undefined;
  /** 版本字段名，默认 "version" */
  versionField?: string;
  /** 透传 createResource mutation onSuccess */
  onSuccess?: (data: TData) => void;
}

export type ResourceFormSubmitResult<TData> =
  | { ok: true; data: TData }
  | { ok: false; fieldErrors: Record<string, string>; formError?: string };

export interface UseResourceFormResult<TData> {
  mode: "create" | "edit";
  /** edit 取数完成前为 undefined（宿主渲染骨架） */
  initialValues: Partial<TData> | undefined;
  recordLoading: boolean;
  /** 恢复过草稿 → UI 提示「已恢复未保存草稿」 */
  draftRestored: boolean;
  discardDraft(): void;
  /** 消费端（TanStack Form）values 变化时调用：防抖写草稿 */
  saveDraft(values: Partial<TData>): void;
  /** 手动清草稿（提交成功后由 onSubmit 内部自动调用） */
  clearDraft(): void;
  onSubmit(values: TData): Promise<ResourceFormSubmitResult<TData>>;
  isSubmitting: boolean;
}

const DEFAULT_DRAFT_DEBOUNCE_MS = 800;

function draftStorage(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function readDraft<TData>(key: string): Partial<TData> | null {
  let raw: string | null = null;
  try {
    raw = draftStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return null;
    return parsed as Partial<TData>;
  } catch {
    return null;
  }
}

/** 从抛出的错误提取服务端错误：422/400 取 body.{fields,form?}；409 → 固定冲突文案 */
export function extractFieldErrors(err: unknown): {
  fieldErrors: Record<string, string>;
  formError?: string;
} {
  if (err instanceof HttpError) {
    if (err.kind === "conflict") {
      return { fieldErrors: {}, formError: "记录已被他人修改，请刷新后重试" };
    }
    if (err.status === 422 || err.status === 400) {
      const body = err.body as { fields?: unknown; form?: unknown; message?: string } | undefined;
      const fieldErrors: Record<string, string> = {};
      if (body?.fields !== null && typeof body?.fields === "object") {
        for (const [field, message] of Object.entries(body.fields as Record<string, unknown>)) {
          if (message === undefined || message === null) continue;
          fieldErrors[field] = typeof message === "string" ? message : String(message);
        }
      }
      return {
        fieldErrors,
        formError: typeof body?.form === "string" ? body.form : (body?.message ?? err.message),
      };
    }
    return { fieldErrors: {}, formError: err.message };
  }
  if (err instanceof Error) return { fieldErrors: {}, formError: err.message };
  return { fieldErrors: {}, formError: "提交失败" };
}

/**
 * 资源表单逻辑壳：create/edit 双模式、edit useOne 取数、422 字段错误、409 冲突、
 * redirect、autosave 草稿。TanStack Form 绑定由 blocks `typed-form-field` 消费本 hook。
 *
 * redirect 相对路径约定（TanStack Router 相对导航）：
 * create+list → '..'；create+detail → '../<id>'；edit+list → '../..'；edit+detail → '..'。
 */
export function useResourceForm<TData>(
  opts: UseResourceFormOptions<TData>,
): UseResourceFormResult<TData> {
  const {
    resource,
    id,
    defaultValues,
    redirect = "list",
    autosave,
    versionOf,
    versionField = "version",
    mutationMode,
    onSuccess,
  } = opts;
  const mode: "create" | "edit" = id !== undefined ? "edit" : "create";
  const autosaveEnabled = autosave?.enabled ?? true;
  const debounceMs = autosave?.debounceMs ?? DEFAULT_DRAFT_DEBOUNCE_MS;

  const query = resource.useOne(mode === "edit" ? id : undefined);
  const record = query.data;
  const recordLoading = mode === "edit" && query.isPending;

  const key = draftKey(resource.name, id);
  const mounted = useMounted();
  /** undefined = 尚未读取；null = 无草稿 */
  const [draft, setDraft] = useState<Partial<TData> | null | undefined>(undefined);
  const [_discardedAt, setDiscardedAt] = useState(0);
  const [isSubmitting, setSubmitting] = useState(false);

  // 草稿首读收敛 effect（discard 后重读 → 此时已无内容，initialValues 回落干净态）
  useEffect(() => {
    setDraft(readDraft<TData>(key));
  }, [key]);

  const versionGetter = useCallback(
    (row: TData): string | undefined => {
      if (versionOf) return versionOf(row);
      const value = (row as Record<string, unknown>)[versionField];
      return value === undefined || value === null ? undefined : String(value);
    },
    [versionOf, versionField],
  );

  const draftActive = draft !== null && draft !== undefined;

  const initialValues = useMemo<Partial<TData> | undefined>(() => {
    if (mode === "edit") {
      if (record === undefined) return undefined;
      const base: Partial<TData> = { ...defaultValues, ...record };
      return draftActive ? { ...base, ...draft } : base;
    }
    const base: Partial<TData> = { ...defaultValues };
    return draftActive ? { ...base, ...draft } : base;
    // biome-ignore lint/correctness/useExhaustiveDependencies: defaultValues 视为稳定引用（页面级常量）
  }, [mode, record, draft, draftActive, defaultValues]);

  const draftRestored = draftActive && (mode === "create" || record !== undefined);

  // -------------------------------------------------------------------------
  // 草稿防抖写
  // -------------------------------------------------------------------------
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clearDraft = useCallback(() => {
    if (timerRef.current !== undefined) clearTimeout(timerRef.current);
    timerRef.current = undefined;
    try {
      draftStorage()?.removeItem(key);
    } catch {
      /* ignore */
    }
  }, [key]);

  useEffect(() => {
    return () => {
      if (timerRef.current !== undefined) clearTimeout(timerRef.current);
    };
  }, []);

  const saveDraft = useCallback(
    (values: Partial<TData>) => {
      if (!autosaveEnabled || !mounted) return;
      if (timerRef.current !== undefined) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        try {
          draftStorage()?.setItem(key, JSON.stringify(values));
        } catch {
          /* 配额/隐私模式：静默放弃草稿 */
        }
      }, debounceMs);
    },
    [autosaveEnabled, debounceMs, key, mounted],
  );

  const discardDraft = useCallback(() => {
    clearDraft();
    setDraft(undefined);
    setDiscardedAt((n) => n + 1);
  }, [clearDraft]);

  // -------------------------------------------------------------------------
  // 提交（create/update 映射 + 422/409 映射 + redirect + 清草稿）
  // -------------------------------------------------------------------------
  const navigate = useNavigate();
  const mutationOpts = useMemo<MutationOpts<any>>(
    () => ({ mutationMode, onSuccess: onSuccess as (data: unknown) => void }),
    [mutationMode, onSuccess],
  );
  const createMutation = resource.useCreate(mutationOpts);
  const updateMutation = resource.useUpdate(mutationOpts);

  const onSubmit = useCallback(
    async (values: TData): Promise<ResourceFormSubmitResult<TData>> => {
      setSubmitting(true);
      try {
        const version = record === undefined ? undefined : versionGetter(record);
        const data =
          mode === "create"
            ? await createMutation.mutateAsync(values as never)
            : await updateMutation.mutateAsync({
                ...(values as object),
                id: id as string,
                ...(version !== undefined ? { version } : {}),
              } as never);
        clearDraft();
        const target =
          typeof redirect === "function"
            ? redirect({ mode, data })
            : redirect === "stay"
              ? undefined
              : redirect === "detail"
                ? mode === "edit"
                  ? ".."
                  : `../${encodeURIComponent(resource.getId(data))}`
                : mode === "edit"
                  ? "../.."
                  : "..";
        if (target !== undefined) {
          await navigate({ to: target, replace: true, search: true } as never);
        }
        return { ok: true, data };
      } catch (err) {
        return { ok: false, ...extractFieldErrors(err) };
      } finally {
        setSubmitting(false);
      }
    },
    [
      mode,
      createMutation,
      updateMutation,
      id,
      record,
      redirect,
      resource,
      clearDraft,
      navigate,
      versionGetter,
    ],
  );

  return {
    mode,
    initialValues,
    recordLoading,
    draftRestored,
    discardDraft,
    saveDraft,
    clearDraft,
    onSubmit,
    isSubmitting,
  };
}

// ---------------------------------------------------------------------------
// useFormDirtyGuard
// ---------------------------------------------------------------------------

export interface DirtyGuardState {
  /** 当前有被阻塞的行内导航（UI 据此渲染确认框） */
  blocked: boolean;
  /** 放行被阻塞的导航（用户确认离开） */
  proceed(): void;
  /** 取消被阻塞的导航（留在本页） */
  stay(): void;
}

/**
 * 脏表单双拦截：TanStack Router useBlocker（行内导航，需路由上下文）+ beforeUnload（刷新/关闭）。
 * 确认 UI 由 blocks 提供：`blocked === true` 时渲染确认框，proceed()/stay() 接管。
 */
export function useFormDirtyGuard(isDirty: boolean, enabled = true): DirtyGuardState {
  const active = enabled && isDirty;

  // beforeunload：浏览器刷新/关闭（原生对话框；仅提示，不可定制）
  useEffect(() => {
    if (!active) return;
    const handler = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [active]);

  // 行内导航：useBlocker + withResolver（status: idle | blocked）
  const activeRef = useRef(active);
  activeRef.current = active;
  const bypassRef = useRef(false);
  const blocker = useBlocker({
    shouldBlockFn: () => !bypassRef.current && activeRef.current,
    enableBeforeUnload: false,
    withResolver: true,
  });

  const blocked = blocker.status === "blocked";
  const proceed = useCallback(() => {
    bypassRef.current = true;
    blocker.proceed?.();
    window.setTimeout(() => {
      bypassRef.current = false;
    }, 0);
  }, [blocker]);
  const stay = useCallback(() => {
    blocker.reset?.();
  }, [blocker]);

  return { blocked, proceed, stay };
}
