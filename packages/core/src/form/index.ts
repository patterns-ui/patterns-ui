/**
 * core/form —— useResourceForm + useFormDirtyGuard（docs/core-api.md §5）。
 *
 * core 只约定逻辑壳（宿主无关）：TanStack Form 绑定在 blocks 层 `typed-form-field`。
 * 草稿（`fc:draft:<resource>:<id|new>`）属偏好语义存 localStorage，读写收敛 effect/事件内。
 */
import { useBlocker, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import { HttpError, type MutationOpts, parseError, type ResourceOf } from "../data";
import { useDebouncedCallback } from "../debounce";
import { useMounted } from "../mounted";
import { createStorage } from "../storage";

export { useDebouncedCallback } from "../debounce";

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

/**
 * 表单 hook 的用户可见默认文案（M6-E 文案对象化：④ 文案从 ② 逻辑解焊）。
 * 宿主经 `useResourceForm({ messages })` 部分覆盖；缺省与 DEFAULT_FORM_MESSAGES 合并
 * （不传 = 行为不变）。
 *
 * 未来 i18n：宿主可注入整体 messageCatalog 覆盖全部默认文案（M6-E 预留，机制非目标）——
 * 届时本接口（及各 hook 的 XxxMessages）即 catalog 的分模块切片形态。
 */
export interface FormMessages {
  /** 409 冲突（乐观并发败者）的表单级提示 */
  conflict: string;
  /** 非 Error 形状的未知提交失败的兜底提示 */
  submitFallback: string;
}

export const DEFAULT_FORM_MESSAGES: FormMessages = {
  conflict: "记录已被他人修改，请刷新后重试",
  submitFallback: "提交失败",
};

export interface UseResourceFormOptions<TData> {
  resource: ResourceOf<TData>;
  /** 有值 = edit 模式（自动 useOne 取数填充） */
  id?: string;
  /** zod v4 直传（Standard Schema；由消费端绑进表单 validators） */
  schema: FormSchema;
  defaultValues: Partial<TData>;
  mutationMode?: "pessimistic" | "optimistic" | "undoable";
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
  /** 默认文案部分覆盖（缺省合并 DEFAULT_FORM_MESSAGES；M6-E 文案对象化） */
  messages?: Partial<FormMessages>;
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

/** 草稿载荷：任意键值对象（TanStack Form values 的 Partial 序列化形态） */
const draftSchema = z.record(z.string(), z.unknown());

/** 草稿存储（createStorage 单源；旧裸 JSON 对象经 migrate 无损沿用） */
function draftStorage(key: string) {
  return createStorage(key, draftSchema, {
    version: 1,
    // 信封前格式 = Partial<TData> 裸 JSON 对象：直接沿用（键值校验交给 schema）
    migrate: (raw) => raw,
  });
}

function readDraft<TData>(key: string): Partial<TData> | null {
  return (draftStorage(key).read() as Partial<TData> | undefined) ?? null;
}

/**
 * 从抛出的错误提取服务端错误：422/400 取 body.{fields,form?}；409 → 固定冲突文案；
 * 非 Error 形状 → 兜底文案。文案经 messages 部分覆盖（缺省 DEFAULT_FORM_MESSAGES）。
 * 信封解析（problem+json/{code,message}/字段错误数组）走 data.parseError 单源（M7-A2）。
 */
export function extractFieldErrors(
  err: unknown,
  messages: Partial<FormMessages> = {},
): {
  fieldErrors: Record<string, string>;
  formError?: string;
} {
  const m: FormMessages = { ...DEFAULT_FORM_MESSAGES, ...messages };
  const parsed = parseError(err);
  if (parsed.kind === "conflict") {
    return { fieldErrors: {}, formError: m.conflict };
  }
  if (parsed.status === 422 || parsed.status === 400) {
    // 表单级错误优先 body.form（{fields,form} 信封）；缺省回落信封 message（body.message ?? error.message）
    const body =
      err instanceof HttpError ? (err.body as { form?: unknown } | undefined) : undefined;
    return {
      // parseError 对 422/400 必回填 fieldErrors（不变量）；此处空表即无字段错误
      fieldErrors: parsed.fieldErrors ?? {},
      formError: typeof body?.form === "string" ? body.form : parsed.message || m.submitFallback,
    };
  }
  if (!(err instanceof Error)) return { fieldErrors: {}, formError: m.submitFallback };
  return { fieldErrors: {}, formError: parsed.message || m.submitFallback };
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
    messages: messagesOpt,
  } = opts;
  /** 合并默认文案（memo：宿主传稳定引用/不传时恒定，避免下游依赖抖动） */
  const messages = useMemo<FormMessages>(
    () => ({ ...DEFAULT_FORM_MESSAGES, ...messagesOpt }),
    [messagesOpt],
  );
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
  }, [mode, record, draft, draftActive, defaultValues]);

  const draftRestored = draftActive && (mode === "create" || record !== undefined);

  // -------------------------------------------------------------------------
  // 草稿防抖写（useDebouncedCallback 单源，M6-B；clearDraft cancel 防已清草稿被在途写回）
  // -------------------------------------------------------------------------
  const persistDraft = useDebouncedCallback((values: Partial<TData>) => {
    draftStorage(key).write(values as Record<string, unknown>);
  }, debounceMs);
  const clearDraft = useCallback(() => {
    persistDraft.cancel();
    draftStorage(key).remove();
  }, [key, persistDraft]);

  const saveDraft = useCallback(
    (values: Partial<TData>) => {
      if (!autosaveEnabled || !mounted) return;
      persistDraft(values);
    },
    [autosaveEnabled, mounted, persistDraft],
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
  const mutationOpts = useMemo<MutationOpts<unknown>>(
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
        return { ok: false, ...extractFieldErrors(err, messages) };
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
      messages,
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
 *
 * `isDirty` 支持两种形态（非破坏性联合）：
 * - `boolean`：经宿主重渲染传播（ref 在渲染期同步）；
 * - `() => boolean`（getter）：宿主可在 form store 原始订阅内同步更新被捕获的 ref——
 *   守卫武装不依赖 React 渲染调度。竞态场景：慢机上「填表 → 立即点导航」可能抢在
 *   Subscribe 重渲染提交之前，boolean 形态的 ref 仍是旧值 → 导航漏拦；getter 形态
 *   在 store 变更的同一任务内武装（demo 的 DirtyGuardHost 即此形态）。
 */
export function useFormDirtyGuard(
  isDirty: boolean | (() => boolean),
  enabled = true,
): DirtyGuardState {
  // shouldBlockFn 读取的脏态出口：boolean 形态每渲染刷新；getter 形态读实时值
  const readDirtyRef = useRef<() => boolean>(() => false);
  readDirtyRef.current = typeof isDirty === "function" ? isDirty : () => isDirty;
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const active = enabled && (typeof isDirty === "function" ? isDirty() : isDirty);

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
  const bypassRef = useRef(false);
  const blocker = useBlocker({
    shouldBlockFn: () => !bypassRef.current && enabledRef.current && readDirtyRef.current(),
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
