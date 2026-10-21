/**
 * core/resource —— L4 defineResource（docs/core-api.md §13）。
 *
 * 一份 ResourceDef 声明 → 列表/详情路由 options + 列/表单推断（Guesser）+ 导航派生。
 * core 只到 options/推断/导航派生；视图工厂（ResourceListView 等）在 blocks 层。
 */
import { type AnyRedirect, redirect } from "@tanstack/react-router";
import type { RowData } from "@tanstack/react-table";
import { z } from "zod";
import { type AuthUser, waitForAuth } from "../auth";
import type { ResourceClient } from "../data";
import type { FilterDef } from "../filters";
import {
  createListSearchSchema,
  type ListColumnDef,
  type ListColumnMeta,
  type ListMode,
} from "../list";

/** 校验 schema：zod v4（或任何 Standard Schema 实现）；core 只透传（与 form 模块 FormSchema 同约定） */
export type ResourceSchema = { readonly "~standard": unknown };

// ---------------------------------------------------------------------------
// ResourceDef（core-api §13）
// ---------------------------------------------------------------------------

export interface ResourceFormSection {
  title: string;
  description?: string;
  fields: string[];
}

export interface ResourceFormDef {
  schema: ResourceSchema;
  sections?: ResourceFormSection[];
  host?: "page" | "sheet" | "dialog";
}

export interface ResourceShowSection {
  title: string;
  items: { label: string; field: string; cell?: string }[];
}

export interface ResourceShowTab {
  id: string;
  label: string;
  kind: "sections" | "sub-resource" | "custom";
  resource?: string;
}

export interface ResourceShowDef {
  sections?: ResourceShowSection[];
  tabs?: ResourceShowTab[];
}

export interface ResourceNavDef {
  /** 导航分组名（同组聚合；分组间按组内最小 order 排序） */
  group: string;
  /** 图标名（宿主图标表解析；core 不含 UI） */
  icon?: string;
  order?: number;
}

export interface ResourceDef<TData extends RowData = any> {
  /** 复数 kebab：'services'（URL 段与 queryKey 前缀） */
  name: string;
  /** 'service'（用于文案；缺省按英文复数规则退化） */
  singular?: string;
  /** 列表/详情标题（缺省 name 首字母大写） */
  label?: string;
  client: ResourceClient<TData, any, any>;
  /** 手写列定义或经 inferColumns 生成（meta.cell 标记由 blocks cellFor 消费） */
  columns: ListColumnDef<TData>[];
  filters?: FilterDef[];
  list?: { mode?: ListMode; pageSize?: number; facets?: string[] };
  form?: ResourceFormDef;
  show?: ResourceShowDef;
  /** 子资源嵌套：parent.resource='services', parent.param='serviceId'（URL 参数 + 永久过滤） */
  parent?: { resource: string; param: string };
  nav?: ResourceNavDef;
  /** 访问控制（beforeLoad 403 / 导航 fail-closed 过滤共用） */
  canAccess?: (user: AuthUser) => boolean;
  /** queryKey 是否含租户段（与 createResource 约定一致；默认 true） */
  tenantScoped?: boolean;
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function naiveSingular(name: string): string {
  if (name.endsWith("ies")) return `${name.slice(0, -3)}y`;
  if (name.endsWith("ses")) return name.slice(0, -2);
  if (name.endsWith("s")) return name.slice(0, -1);
  return name;
}

/** 声明资源：补默认值（singular/label/tenantScoped）并做最小校验；不生成路由树 */
export function defineResource<TData extends RowData>(def: ResourceDef<TData>): ResourceDef<TData> {
  if (!def.name || typeof def.name !== "string") {
    throw new Error("defineResource: name is required (plural kebab-case)");
  }
  if (
    !def.client ||
    typeof def.client.list !== "function" ||
    typeof def.client.get !== "function"
  ) {
    throw new Error(`defineResource(${def.name}): client must implement list/get`);
  }
  return {
    tenantScoped: true,
    ...def,
    singular: def.singular ?? naiveSingular(def.name),
    label: def.label ?? capitalize(def.name),
  };
}

// ---------------------------------------------------------------------------
// 路由 options 工厂（文件路由内展开使用）
// ---------------------------------------------------------------------------

/** beforeLoad 上下文最小约定（TanStack Router ctx 满足此形状） */
interface RouteCtx {
  location: { href: string; pathname: string };
}

/** canAccess → requireRole 风格守卫：未认证 → sign-in?next；无权限 → /403 */
function guardFor(
  def: ResourceDef<any>,
): ((ctx: RouteCtx) => Promise<AnyRedirect | undefined>) | undefined {
  if (!def.canAccess) return undefined;
  return async (ctx) => {
    const snap = await waitForAuth();
    if (snap.status !== "authenticated" || !snap.user) {
      return redirect({ to: "/auth/sign-in", search: { next: ctx.location.href } }) as AnyRedirect;
    }
    if (!def.canAccess?.(snap.user)) {
      return redirect({ to: "/403" }) as AnyRedirect;
    }
    return undefined;
  };
}

export interface ResourceListRouteOptions {
  /** zod 对象（Standard Schema；保持具体类型以便文件路由直接展开） */
  validateSearch: z.ZodObject<Record<string, z.ZodType>>;
  staticData: { title: string };
  beforeLoad?: (ctx: RouteCtx) => Promise<AnyRedirect | undefined>;
}

/** 列表路由 options：validateSearch 按 def.filters/list 生成 + 权限 beforeLoad + staticData.title */
export function resourceListRouteOptions(def: ResourceDef<any>): ResourceListRouteOptions {
  const shape = createListSearchSchema({
    search: true,
    filters: def.filters,
    sort: { multi: true },
    pagination: def.list?.pageSize
      ? { pageSizeOptions: [10, 20, 50, 100, def.list.pageSize] }
      : undefined,
  }).shape;
  const withParent: Record<string, z.ZodType> = { ...shape };
  if (def.parent) {
    withParent[def.parent.param] = z.string().optional().catch(undefined);
  }
  const options: ResourceListRouteOptions = {
    validateSearch: z.object(withParent),
    staticData: { title: def.label ?? capitalize(def.name) },
  };
  const guard = guardFor(def);
  if (guard) options.beforeLoad = guard;
  return options;
}

export interface ResourceDetailRouteOptions {
  staticData: { title: string };
  loader?: (ctx: {
    context: Record<string, unknown>;
    params: Record<string, string | undefined>;
  }) => Promise<unknown>;
  beforeLoad?: (ctx: RouteCtx) => Promise<AnyRedirect | undefined>;
}

/**
 * 详情路由 options：staticData.title（单数文案）+ loader 预取。
 * 预取经 queryClient.ensureQueryData 走与 createResource 一致的 detail key
 * （`[name, tenantId?, 'detail', id]`）→ 详情挂载即命中缓存。
 */
export function resourceDetailRouteOptions(def: ResourceDef<any>): ResourceDetailRouteOptions {
  const options: ResourceDetailRouteOptions = {
    staticData: { title: def.singular ?? naiveSingular(def.name) },
  };
  const guard = guardFor(def);
  if (guard) options.beforeLoad = guard;
  options.loader = async ({ context, params }) => {
    const queryClient = context?.queryClient as
      | {
          ensureQueryData: (opts: {
            queryKey: unknown[];
            queryFn: () => Promise<unknown>;
          }) => Promise<unknown>;
        }
      | undefined;
    const id = params?.id;
    if (!queryClient || id === undefined || id === "") return undefined;
    const key =
      def.tenantScoped === false
        ? [def.name, "detail", id]
        : [def.name, params.tenantId, "detail", id];
    return queryClient.ensureQueryData({
      queryKey: key,
      queryFn: () => def.client.get(id),
    });
  };
  return options;
}

// ---------------------------------------------------------------------------
// inferColumns —— 样本行类型推断 → 列定义（meta.cell 标记）+ report
// ---------------------------------------------------------------------------

export type InferredCellKind =
  | "id"
  | "time"
  | "user"
  | "boolean"
  | "number"
  | "enum"
  | "text"
  | "tags";

/** 列 meta 形状（ListColumnMeta 的 resource 推断子集） */
export interface InferredColumnMeta extends ListColumnMeta {
  cell?: InferredCellKind;
  /** enum 的选项值（distinct 值表） */
  enumValues?: string[];
}

const ISO_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** 「自由文本」字段名模式：不做枚举推断（name/title 类几乎必然全唯一） */
const FREE_TEXT_FIELD_RE =
  /(^|_)(name|title|label|slug|description|note|comment|url|uri|path|ref)$/i;

function inferFieldKind(
  field: string,
  values: unknown[],
  enumLimit = 12,
): { kind: InferredCellKind; enumValues?: string[] } {
  const present = values.filter((v) => v !== undefined && v !== null && v !== "");
  if (present.length === 0) return { kind: "text" };

  const allString = present.every((v) => typeof v === "string");
  if (allString) {
    const strs = present as string[];
    if (field === "id" || field.endsWith("Id") || field.endsWith("_id")) {
      return { kind: "id" };
    }
    if (strs.every((s) => ISO_RE.test(s))) return { kind: "time" };
    if (strs.every((s) => UUID_RE.test(s))) return { kind: "id" };
    if (strs.every((s) => s.includes("@"))) return { kind: "user" };
    const distinct = [...new Set(strs)];
    const avgLen = strs.reduce((n, s) => n + s.length, 0) / strs.length;
    const allUnique = distinct.length === strs.length && strs.length > 3;
    if (
      !FREE_TEXT_FIELD_RE.test(field) &&
      !allUnique &&
      avgLen <= 24 &&
      distinct.length <= enumLimit &&
      distinct.length > 1
    ) {
      return { kind: "enum", enumValues: distinct.sort() };
    }
    return { kind: "text" };
  }
  if (present.every((v) => typeof v === "boolean")) return { kind: "boolean" };
  if (present.every((v) => typeof v === "number")) return { kind: "number" };
  if (present.every((v) => Array.isArray(v))) return { kind: "tags" };
  if (present.every((v) => v instanceof Date)) return { kind: "time" };
  return { kind: "text" };
}

const HIDDEN_FIELDS = new Set(["version", "_secretOnce"]);

export interface InferColumnsResult {
  columns: ListColumnDef<any>[];
  report: string;
}

/**
 * 样本行 → 列定义（类型推断）。cell 渲染不落在 core：列 meta.cell 标记推断类型，
 * blocks 层（resource-list-view / cellFor）消费标记渲染；size/enableSorting 顺带给默认。
 * report = 可打印的等价配置代码（Guesser 用）。
 */
export function inferColumns(
  sample: Record<string, unknown>[],
  opts: { enumLimit?: number; skipFields?: string[] } = {},
): InferColumnsResult {
  if (sample.length === 0) {
    return { columns: [], report: "// inferColumns: 空样本（sample 至少 1 行）" };
  }
  const skip = new Set([...(opts.skipFields ?? []), ...HIDDEN_FIELDS]);
  const fields = Object.keys(sample[0] ?? {}).filter((f) => !skip.has(f));
  const enumLimit = opts.enumLimit ?? 12;

  const columns: ListColumnDef<any>[] = [];
  const lines: string[] = [];
  for (const field of fields) {
    const { kind, enumValues } = inferFieldKind(
      field,
      sample.map((row) => row[field]),
      enumLimit,
    );
    const column: ListColumnDef<any> = {
      id: field,
      accessorKey: field,
      header: field,
      meta: { cell: kind, ...(enumValues ? { enumValues } : {}) },
      ...(kind === "time" ? { size: 180 } : {}),
      ...(kind === "id" ? { size: 140 } : {}),
    };
    columns.push(column);
    const metaArgs = enumValues
      ? `, enumValues: [${enumValues.map((v) => JSON.stringify(v)).join(", ")}]`
      : "";
    lines.push(
      `  helper.accessor(${JSON.stringify(field)}, { header: ${JSON.stringify(field)}, meta: { cell: ${JSON.stringify(kind)}${metaArgs} } }),`,
    );
  }

  const report = [
    "// inferColumns(sample) 生成结果（可直接粘贴进 defineResource columns）：",
    "const helper = createListColumnHelper<YourRow>()",
    `const columns = [`,
    ...lines,
    "]",
    "// meta.cell → blocks cellFor 渲染：id→cell-id, time→cell-time, boolean→cell-boolean,",
    "// enum→cell-enum-badge, number→cell-number, user→cell-user, tags→cell-tags",
  ].join("\n");
  return { columns, report };
}

// ---------------------------------------------------------------------------
// inferFormFields —— zod schema 形状 / 样本 → widget 映射 + report
// ---------------------------------------------------------------------------

export type InferredWidget =
  | "text"
  | "textarea"
  | "number"
  | "select"
  | "multi-select"
  | "switch"
  | "date"
  | "tags"
  | "kv-pairs";

export interface InferredFormField {
  name: string;
  widget: InferredWidget;
  label: string;
  options?: { value: string; label: string }[];
}

export interface InferFormFieldsResult {
  fields: InferredFormField[];
  report: string;
}

function unwrapSchema(node: unknown): unknown {
  let current = node;
  for (let i = 0; i < 8 && current !== null && typeof current === "object"; i++) {
    const ctor = (current as { constructor?: { name?: string } }).constructor;
    const name = ctor?.name ?? "";
    const inner = (current as { innerType?: unknown; defaultValue?: unknown; def?: unknown })
      .innerType;
    if (
      (name === "ZodOptional" || name === "ZodNullable" || name === "ZodDefault") &&
      inner !== undefined
    ) {
      current = inner;
      continue;
    }
    break;
  }
  return current;
}

function schemaCtorName(node: unknown): string {
  const ctor = (node as { constructor?: { name?: string } } | null)?.constructor;
  return ctor?.name ?? "";
}

/** zod v4：checks 位于 `schema._zod.def.checks`，string_format 检查带 def.format（'datetime'|'email'|…） */
function zodStringFormats(node: unknown): string[] {
  const def = (node as { _zod?: { def?: { checks?: unknown[] } } })?._zod?.def;
  const checks = def?.checks ?? [];
  const formats: string[] = [];
  for (const check of checks) {
    const inner = (check as { def?: { format?: string } }).def;
    if (inner?.format) formats.push(inner.format);
  }
  return formats;
}

function fieldFromZod(name: string, node: unknown): InferredFormField {
  const label = name.charAt(0).toUpperCase() + name.slice(1).replace(/([A-Z])/g, " $1");
  const unwrapped = unwrapSchema(node);
  const kind = schemaCtorName(unwrapped);

  switch (kind) {
    case "ZodEmail":
      return { name, widget: "text", label };
    case "ZodNumber":
      return { name, widget: "number", label };
    case "ZodBoolean":
      return { name, widget: "switch", label };
    case "ZodDate":
      return { name, widget: "date", label };
    case "ZodEnum": {
      const options = ((unwrapped as { options?: unknown[] }).options ?? []).map((v) => ({
        value: String(v),
        label: String(v),
      }));
      return { name, widget: "select", label, options };
    }
    case "ZodArray": {
      const element = (unwrapped as { element?: unknown }).element;
      const elementKind = schemaCtorName(unwrapSchema(element));
      if (elementKind === "ZodEnum") {
        const options = ((unwrapSchema(element) as { options?: unknown[] }).options ?? []).map(
          (v) => ({ value: String(v), label: String(v) }),
        );
        return { name, widget: "multi-select", label, options };
      }
      return { name, widget: "tags", label };
    }
    case "ZodRecord":
    case "ZodPartialRecord":
      return { name, widget: "kv-pairs", label };
    default: {
      // ZodString 细分：datetime 格式检查 → date；长文本字段名约定 → textarea
      const formats = zodStringFormats(unwrapped);
      if (formats.includes("datetime")) return { name, widget: "date", label };
      if (/description|note|comment|bio|content|body/i.test(name)) {
        return { name, widget: "textarea", label };
      }
      return { name, widget: "text", label };
    }
  }
}

/**
 * zod schema（ZodObject 形状）或样本行 → 表单字段推断。
 * schema 优先走字段级 zod 类型映射；数组形态回落到 inferColumns 的类型推断。
 */
export function inferFormFields(
  schemaOrSample: z.ZodTypeAny | Record<string, unknown>[],
): InferFormFieldsResult {
  const fields: InferredFormField[] = [];

  if (Array.isArray(schemaOrSample)) {
    if (schemaOrSample.length > 0) {
      const skip = new Set([...HIDDEN_FIELDS, "id", "createdAt", "updatedAt"]);
      const sampleFields = Object.keys(schemaOrSample[0] ?? {}).filter((f) => !skip.has(f));
      for (const field of sampleFields) {
        const { kind, enumValues } = inferFieldKind(
          field,
          schemaOrSample.map((row) => row[field]),
        );
        const widgetMap: Record<InferredCellKind, InferredWidget> = {
          id: "text",
          time: "date",
          user: "text",
          boolean: "switch",
          number: "number",
          enum: "select",
          text: "text",
          tags: "tags",
        };
        const widget: InferredWidget =
          kind === "text" && /description|note|comment|bio|content|body/i.test(field)
            ? "textarea"
            : widgetMap[kind];
        fields.push({
          name: field,
          widget,
          label: field.charAt(0).toUpperCase() + field.slice(1).replace(/([A-Z])/g, " $1"),
          ...(enumValues ? { options: enumValues.map((v) => ({ value: v, label: v })) } : {}),
        });
      }
    }
  } else {
    const shape = (schemaOrSample as unknown as { shape?: Record<string, unknown> }).shape;
    if (shape === undefined || typeof shape !== "object") {
      return {
        fields: [],
        report: "// inferFormFields: 非 ZodObject 形状（传入 z.object(...) 或样本行数组）",
      };
    }
    for (const [name, node] of Object.entries(shape)) {
      if (HIDDEN_FIELDS.has(name)) continue;
      fields.push(fieldFromZod(name, node));
    }
  }

  const report = [
    "// inferFormFields 生成结果（typed-form-field widget 映射）：",
    "const fields = [",
    ...fields.map(
      (f) =>
        `  { name: ${JSON.stringify(f.name)}, widget: ${JSON.stringify(f.widget)}, label: ${JSON.stringify(f.label)}${f.options ? `, options: ${JSON.stringify(f.options)}` : ""} },`,
    ),
    "]",
    "// widget → typed-form-field：<field.TextWidget|NumberWidget|SelectWidget|SwitchWidget|DateWidget|MultiSelectWidget|TagsWidget|KvPairsWidget ...>",
  ].join("\n");
  return { fields, report };
}

// ---------------------------------------------------------------------------
// Guesser（dev-only）
// ---------------------------------------------------------------------------

function isDev(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string> } }).process?.env;
  if (env?.NODE_ENV === "production") return false;
  const meta = (import.meta as unknown as { env?: { DEV?: boolean } }).env;
  if (meta?.DEV === true) return true;
  return env?.NODE_ENV !== "test";
}

/**
 * dev-only Guesser：拉一页样本 → console.info 推断出的 columns/form 配置。
 * 生产环境静默跳过（不产生请求与日志）。
 */
export async function printGuess(def: ResourceDef<any>): Promise<void> {
  if (!isDev()) return;
  try {
    const page = await def.client.list({ pageSize: 25 });
    const { columns, report } = inferColumns(page.rows as Record<string, unknown>[]);
    console.info(
      `[resource-guesser] ${def.name}（${page.rows.length} 行样本，${columns.length} 列）\n${report}`,
    );
    if (def.form?.schema) {
      const formResult = inferFormFields(def.form.schema as z.ZodTypeAny);
      console.info(`[resource-guesser] ${def.name} form\n${formResult.report}`);
    }
  } catch (err) {
    console.warn(`[resource-guesser] ${def.name} 样本拉取失败：`, err);
  }
}

// ---------------------------------------------------------------------------
// navFromResources —— 资源注册表 → 导航分组
// ---------------------------------------------------------------------------

export interface NavResourceItem {
  name: string;
  label: string;
  /** 相对租户根的路径段（`/services`；宿主拼接 /t/:tid 前缀） */
  to: string;
  icon?: string;
  order?: number;
}

export interface NavResourceGroup {
  group: string;
  items: NavResourceItem[];
}

/**
 * 资源注册表 → 导航分组：按 nav.group 聚合、组内 nav.order 排序（缺省排最后、保持声明序）、
 * canAccess fail-closed 过滤（user 缺失且有 canAccess → 隐藏）。无 nav 的资源不进导航。
 */
export function navFromResources(defs: ResourceDef<any>[], user?: AuthUser): NavResourceGroup[] {
  const groups = new Map<
    string,
    { group: string; items: (NavResourceItem & { seq: number; order: number })[] }
  >();
  let seq = 0;
  for (const def of defs) {
    if (!def.nav) continue;
    if (def.canAccess) {
      if (!user || !def.canAccess(user)) continue; // fail-closed
    }
    const key = def.nav.group;
    let bucket = groups.get(key);
    if (bucket === undefined) {
      bucket = { group: key, items: [] };
      groups.set(key, bucket);
    }
    bucket.items.push({
      name: def.name,
      label: def.label ?? capitalize(def.name),
      to: `/${def.name}`,
      icon: def.nav.icon,
      order: def.nav.order ?? Number.MAX_SAFE_INTEGER,
      seq: seq++,
    });
  }
  return [...groups.values()]
    .map((bucket) => ({
      group: bucket.group,
      items: bucket.items
        .sort((a, b) => a.order - b.order || a.seq - b.seq)
        .map(({ name, label, to, icon, order }) => ({
          name,
          label,
          to,
          ...(icon !== undefined ? { icon } : {}),
          ...(order !== Number.MAX_SAFE_INTEGER ? { order } : {}),
        })),
    }))
    .sort((a, b) => {
      const minA = Math.min(
        ...a.items.map((i) => i.order ?? Number.MAX_SAFE_INTEGER),
        Number.MAX_SAFE_INTEGER,
      );
      const minB = Math.min(
        ...b.items.map((i) => i.order ?? Number.MAX_SAFE_INTEGER),
        Number.MAX_SAFE_INTEGER,
      );
      return minA - minB;
    });
}
