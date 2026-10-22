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
  DEFAULT_PAGE_SIZE,
  type DefListShape,
  type ListColumnDef,
  type ListColumnMeta,
} from "../list";
import type { BlockName } from "../vocab";

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

/**
 * 详情键值区的 cell 渲染选项（M7-A3：sections items 的声明式渲染参数；
 * cellFor 家族键由 blocks cellFor 消费，inline-edit/reference/mono 由 DetailGrid 消费）。
 * 适配器值（resolve/getIdLabel/resource 实例）为类型化非闭包引用（paradigm §3.4）。
 */
export interface ResourceShowCellOptions {
  /** cell-status：值 → tone 映射 */
  map?: Record<string, string>;
  /** cell-status：活动态（呼吸点）值 */
  pulseFor?: string[];
  /** cell-number：格式 */
  format?: "int" | "decimal" | "percent" | "bytes";
  unit?: string;
  /** cell-enum-badge：选项表 */
  options?: readonly { value: string; variant?: string }[];
  /** cell-id：截断位数 */
  chars?: number;
  /** cell-user：id + resolve 解析形态 */
  resolve?: (id: string) => { name: string; avatarUrl?: string } | undefined;
  /** cell:"inline-edit"：编辑类型（缺省 text） */
  type?: "text" | "number";
  /** cell:"mono"：前缀（如版本号 v） */
  prefix?: string;
  /** cell:"reference"：外键资源实例（createResource 产物）与 label 读取 */
  getIdLabel?: (row: Record<string, unknown>) => string;
  /** cell:"reference" 的资源实例（视图层消费） */
  resource?: unknown;
  /** cell:"inline-edit" 的保存适配器（value, data)；缺省由视图层 inlineSave 注入 */
  onSave?: (value: string | number, data: Record<string, unknown>) => Promise<void>;
}

export interface ResourceShowSection {
  title: string;
  items: { label: string; field: string; cell?: string; cellOptions?: ResourceShowCellOptions }[];
}

export interface ResourceShowTab {
  id: string;
  label: string;
  kind: "sections" | "sub-resource" | "custom";
  resource?: string;
  /**
   * kind:"custom" 登记名（M7-A2 登记制，必填其一）：
   * - block：词表 block 名（typecheck 收窄到封闭词表）；
   * - sandbox：宿主登记表键（sandbox 棘轮名，非词表域）。
   * 渲染经 resource-detail-view 的 customTabs 注入表解析；render 函数出口保留为宿主
   * 逃生位但必须登记后使用（未登记 → dev throw）。
   */
  block?: BlockName;
  sandbox?: string;
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

/** 行主键读取的显名形态（泛型体内穿透用；id 字段的存在性由下方编译期约束保证） */
interface RowWithId {
  id: string;
}

/**
 * getId 编译期约束（M6-C）：行类型不带 `id: string` 主键时，def 必须显式声明 getId，
 * 否则类型层直接报错——运行时「回退 String(row.id)」的 silent fallback 不再藏在类型层之下。
 */
type RequireGetId<TData extends RowData> = TData extends RowWithId
  ? unknown
  : { getId: (row: TData) => string };

export interface ResourceDefShape<TData extends RowData> {
  /** 复数 kebab：'services'（URL 段与 queryKey 前缀） */
  name: string;
  /** 'service'（用于文案；缺省按英文复数规则退化） */
  singular?: string;
  /** 列表/详情标题（缺省 name 首字母大写） */
  label?: string;
  client: ResourceClient<TData, unknown, unknown>;
  /** 手写列定义或经 inferColumns 生成（meta.cell 标记由 blocks cellFor 消费） */
  columns: ListColumnDef<TData>[];
  /** 行主键（缺省读 row.id——TData 带 string id 或已显式声明 getId 二者必有其一，编译期保证） */
  getId?: (row: TData) => string;
  filters?: FilterDef[];
  /**
   * list.pageSize 是页大小唯一真相：直灌 useResourceTable 缺省与路由 schema（M6-C 单源）。
   * pagination 是分页协议一等契约节点（M7-A2：page/offset/keyset 封闭词表，映射见 core-api §3.1）；
   * legacy mode 双轨兼容（A3 迁移后移除）。
   */
  list?: DefListShape & { pageSize?: number; facets?: string[] };
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

/** def 声明形态：shape + getId 编译期强制（见 RequireGetId） */
export type ResourceDef<TData extends RowData = RowData> = ResourceDefShape<TData> &
  RequireGetId<TData>;

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function naiveSingular(name: string): string {
  if (name.endsWith("ies")) return `${name.slice(0, -3)}y`;
  if (name.endsWith("ses")) return name.slice(0, -2);
  if (name.endsWith("s")) return name.slice(0, -1);
  return name;
}

/**
 * 「任意资源 def」：路由 options 工厂 / Guesser / 导航注册表接收混合 TData 的 def 集合，
 * 统一收集形态（与 data 层 AnyResource 同理，单点收敛）。
 */
// biome-ignore lint/suspicious/noExplicitAny: 混合 TData 资源注册表的统一形态（core-api §13）；禁止在具体逻辑内新开 any
export type AnyResourceDef = ResourceDef<any>;

/** 缺省主键读取：row.id（存在性由 ResourceDef 的编译期约束保证，非 silent fallback） */
function idOf<TData extends RowData>(row: TData): string {
  // TData 泛型体内不可见具体形状；RowWithId & RowData 是显名窄化形态（单点、有注释）
  return (row as RowWithId & RowData).id;
}

/** 声明资源：补默认值（singular/label/tenantScoped/getId）并做最小校验；不生成路由树 */
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
    // 归一主键读取：缺省 row.id（编译期保证存在）或显式 getId——消费方（createResource 装配等）无需自带回退
    getId: def.getId ?? idOf,
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
  def: AnyResourceDef,
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
export function resourceListRouteOptions(def: AnyResourceDef): ResourceListRouteOptions {
  const shape = createListSearchSchema({
    search: true,
    filters: def.filters,
    sort: { multi: true },
    // def.list.pageSize 直灌为缺省档（M6-C 单源）：URL 无 size → 缺省；?size=缺省值 合法。
    // 不再把 def 值 reverse-merge 进 pageSizeOptions——UI 档位不反向成为数据源。
    pagination:
      def.list?.pageSize !== undefined ? { defaultPageSize: def.list.pageSize } : undefined,
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
export function resourceDetailRouteOptions(def: AnyResourceDef): ResourceDetailRouteOptions {
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

/**
 * 列类型分类用 ISO 严形状（M6-E 决策：与 datetime.isIsoDate 有意保留两套）：
 * 时间部分必须 `T` 分隔且 `HH:MM[:SS[.fff]]` 数字组结构合法、可带 `Z/±HH:MM`——
 * inferColumns 借它决定整列渲染为 cell-time，误判代价高，必须严形状。
 * datetime.isIsoDate 是宽松形状（含空格分隔、时间部分不校验数字组），服务 filters
 * 的 comparable() 尽力归一化（解析失败自然回落），两者语义不可互换。
 */
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
  columns: ListColumnDef<RowData>[];
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

  const columns: ListColumnDef<RowData>[] = [];
  const lines: string[] = [];
  for (const field of fields) {
    const { kind, enumValues } = inferFieldKind(
      field,
      sample.map((row) => row[field]),
      enumLimit,
    );
    const column: ListColumnDef<RowData> = {
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

/** zod v4 对象 schema 的形状面（ZodObject 的公共 shape 属性；内省入口的显名窄化形态） */
type ZodObjectLike = z.ZodTypeAny & { shape?: Record<string, unknown> };

/** dev 判定的环境面（import.meta.env 仅 vite 宿主存在；显名形态替代裸断言） */
interface ImportMetaEnvLike {
  env?: { DEV?: boolean };
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
 * zod 私有 API（`_zod.def` / `innerType` / 构造器名）内省是易变启发式（§2.3 上浮债）：
 * 生产构建不执行（包进 dev-only）；dev/test 照常——单测需要覆盖该启发式，
 * 故不直接复用 isDev()（其语义为「非 test 的开发态」）。
 */
function zodIntrospectionEnabled(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string> } }).process?.env;
  return env?.NODE_ENV !== "production";
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
    // zod 私有 API 内省为 dev-only（M6-C）：生产构建跳过（返回空 + 说明），不发请求不抛错
    if (!zodIntrospectionEnabled()) {
      return {
        fields: [],
        report: "// inferFormFields: zod 形状内省为 dev-only（生产构建跳过；传入样本行数组仍可用）",
      };
    }
    const shape = (schemaOrSample as ZodObjectLike).shape;
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
  const meta = (import.meta as ImportMetaEnvLike).env;
  if (meta?.DEV === true) return true;
  return env?.NODE_ENV !== "test";
}

/**
 * dev-only Guesser：拉一页样本 → console.info 推断出的 columns/form 配置。
 * 生产环境静默跳过（不产生请求与日志）。
 */
export async function printGuess(def: AnyResourceDef): Promise<void> {
  if (!isDev()) return;
  try {
    // 样本拉取页大小同样以 def.list.pageSize 为唯一真相（缺省 DEFAULT_PAGE_SIZE=20，M6-C）
    const page = await def.client.list({ pageSize: def.list?.pageSize ?? DEFAULT_PAGE_SIZE });
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
export function navFromResources(defs: AnyResourceDef[], user?: AuthUser): NavResourceGroup[] {
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
