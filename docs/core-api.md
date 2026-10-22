# @patterns-ui/core API 规格

逻辑包的完整契约。所有签名按此实现；实现时如发现设计缺陷，先改本文再改代码（文档是唯一事实源）。

包结构（子路径导出）：

```ts
import { ... } from '@patterns-ui/core/data'
import { ... } from '@patterns-ui/core/list'
import { ... } from '@patterns-ui/core/filters'
// ... /form /reference /tenant /auth /router /task /inline /datetime /resource /theme /storage
```

peerDependencies：`react@^19`、`@tanstack/react-query@^5`、`@tanstack/react-router@^1`、`@tanstack/react-table@^9.3`（list 模块，M6-A 起）、`zod@^4`。运行依赖：`next-themes`（theme 模块）、`use-sync-external-store`（auth/tenant 等非 React 内置 store 订阅，M6-B 起）。

---

## 1. data/ —— 数据契约

### 1.1 基础类型

```ts
export type SortDirection = 'asc' | 'desc'
export interface SortSpec { field: string; direction: SortDirection }

export type FilterOperator =
  | 'eq' | 'ne' | 'in' | 'nin'
  | 'contains' | 'gt' | 'gte' | 'lt' | 'lte'
  | 'between' | 'exists'

export interface FilterLeaf {
  field: string
  op: FilterOperator
  value: unknown          // between: [min, max]；in/nin: unknown[]
}
export interface FilterNode {
  combinator: 'and' | 'or'
  children: FilterTree[]
}
export type FilterTree = FilterLeaf | FilterNode

export interface FacetBucket { value: string; count: number }
export interface FacetResult { field: string; buckets: FacetBucket[] }

export interface Page<T> {
  rows: T[]
  total?: number           // offset 模式应提供；cursor 模式可缺省
  nextCursor?: string      // cursor 模式：无值即最后一页
  facets?: FacetResult[]   // 请求了 facets 时返回
}

export interface ListParams {
  page?: number            // offset 模式，1-based
  pageSize: number
  cursor?: string          // cursor 模式
  sort?: SortSpec[]
  filters?: FilterTree
  search?: string
  facets?: string[]        // 需要返回计数的 facet 字段名
}
```

### 1.2 ResourceClient

```ts
export interface BulkResult {
  succeeded: string[]      // ids
  failed: { id: string; error: unknown }[]
}

export interface ResourceClient<TData, TCreate = Partial<TData>, TUpdate = Partial<TData>> {
  list(params: ListParams): Promise<Page<TData>>
  get(id: string): Promise<TData>
  create?(vars: TCreate): Promise<TData>
  update?(id: string, vars: TUpdate, opts?: { version?: string | number }): Promise<TData>  // 409 由实现方抛 HttpError(409)
  delete?(id: string): Promise<void>
  getMany?(ids: string[]): Promise<TData[]>   // 可选；缺省用 list + in 过滤分块（每块 50）兜底
  bulkDelete?(ids: string[]): Promise<BulkResult>
  bulkUpdate?(ids: string[], vars: TUpdate): Promise<BulkResult>
}

export class HttpError extends Error {
  constructor(public status: number, message: string, public body?: unknown)
  // 细分: 401 未认证 / 403 无权限 / 404 不存在 / 409 冲突 / >=5xx 服务端
}
```

适配器约定：任何 fetch/axios/openapi 客户端写 ~20 行实现此接口即可接入。**适配器代码属于使用方项目，不在本库**（demo 里的实现仅是示例）。

### 1.3 createResource

```ts
export interface Resource<TData, TCreate, TUpdate> {
  readonly name: string
  readonly client: ResourceClient<TData, TCreate, TUpdate>
  readonly tenantScoped: boolean          // true 时 queryKey 自动含当前租户

  useList(params: ListParams & {
    enabled?: boolean
    placeholderData?: 'keep'
    staleTime?: number          // M2 增补：逐调用覆盖（缺省回落 cfg.queryOptions）
    refetchInterval?: number | false
  }): UseQueryResult<Page<TData>>
  useOne(id: string | undefined, opts?: { enabled?: boolean }): UseQueryResult<TData>

  useCreate(opts?: MutationOpts<TCreate>): UseMutationResult<TData, Error, TCreate>
  useUpdate(opts?: MutationOpts<UpdateVars<TUpdate>>): ...   // UpdateVars<T> = Omit<T,'version'> & { id; version?: string|number }
  useDelete(opts?: MutationOpts<{ id: string }>): ...
  useBulkDelete(opts?: MutationOpts<{ ids: string[] }>): ...
  useBulkUpdate(opts?: MutationOpts<{ ids: string[]; vars: TUpdate }>): ...
}

export interface MutationOpts<TVars> {
  mutationMode?: 'pessimistic' | 'optimistic' | 'undoable'   // 默认 pessimistic
  undoDurationMs?: number                                    // undoable 默认 5000
  onSuccess?: (data: unknown, vars: TVars) => void           // 自定义成功回调（替代默认 toast 约定的钩子位）
  // M2 增补：undoable 档 toast 回调位（core 不含 UI；blocks 侧 use-resource-mutations 接 sonner）
  onUndoableToast?: (ctl: { undo(): void; dismiss(): void; secondsLeft: number }) => void
}

export function createResource<TData, TCreate, TUpdate>(cfg: {
  name: string
  client: ResourceClient<TData, TCreate, TUpdate>
  tenantScoped?: boolean                     // 默认 true；TenantProvider 存在时生效
  getId?: (row: TData) => string             // 默认 (r) => (r as any).id
  queryOptions?: { staleTime?: number; refetchOnWindowFocus?: boolean }
}): Resource<TData, TCreate, TUpdate>
```

**queryKey 约定**：`[name, tenantId?, 'list', params]` / `[name, tenantId?, 'detail', id]` / `[name, tenantId?, 'many', ids 去重排序]`。失效规则：create/bulk → 失效本资源所有 `list`；update → 失效 `list` + 该 id 的 `detail`；delete/bulkX → 失效 `list` + `detail`。

**queryKey 工厂公共出口（M6-B 单源钉死）**——data 与 reference 内部、宿主失效逻辑全部走同一实现（跨模块一致性由契约测试锁定）：

```ts
export function listKey(name: string, params: unknown, opts?: { tenantId?: string }): readonly unknown[]
export function detailKey(name: string, id: string, opts?: { tenantId?: string }): readonly unknown[]
export function manyKey(name: string, ids: readonly string[], opts?: { tenantId?: string }): readonly unknown[]
// 失效用段前缀（前缀匹配任意 params / 任意 id / 任意租户段）：
export function listKeyPrefix(name: string, tenantId?: string): readonly unknown[]
export function detailKeyPrefix(name: string, tenantId?: string, id?: string): readonly unknown[]
export function scopeOf(name: string, tenantId?: string): readonly unknown[]   // [name] | [name, tenantId]
export function resourceScope(name: string, tenantId?: string): string[]      // 便捷前缀（测试/调试）
```

**undoable 时序出口（M6-E 起 data 单源）**：`scheduleUndoable`、`UndoableJob`、`ScheduleUndoable`、`UndoableToastControl` 一律从 `@patterns-ui/core/data` 导入（原 `./mutation` 兼容壳已删除，见 §6）。

**mutationMode 语义**：

- `pessimistic`：等响应，成功后失效缓存。
- `optimistic`：立即对 query cache 应用变更（update/delete 直接改缓存），失败回滚 + 抛错。
- `undoable`：立即应用乐观变更 → toast 显示「已撤销？」倒计时（undoDurationMs）→ 超时真正提交；提交失败回滚并报错；撤销则还原缓存。toast UI 由调用方（blocks 层的 mutation helper）接住 core 发出的事件回调；core 只负责缓存与提交时序。

---

## 2. filters/ —— 过滤模型

```ts
export type FilterDef =
  | SelectFilterDef | MultiSelectFilterDef | TextFilterDef
  | NumberFilterDef | DateRangeFilterDef | CustomFilterDef

export interface FilterDefBase { field: string; label: string; server?: boolean }  // server=false → 客户端求值（client 模式列表）
export interface SelectFilterDef extends FilterDefBase {
  kind: 'select'; op?: FilterOperator            // 默认 'eq'
  options: { value: string; label: string }[]
}
export interface MultiSelectFilterDef extends FilterDefBase {
  kind: 'multi-select'; op?: FilterOperator      // 默认 'in'
  options: { value: string; label: string }[] | 'facet'   // 'facet' → 选项与计数来自 Page.facets
}
export interface TextFilterDef extends FilterDefBase { kind: 'text'; op?: FilterOperator }  // 默认 'contains'
export interface NumberFilterDef extends FilterDefBase { kind: 'number'; op?: 'eq'|'gt'|'gte'|'lt'|'lte'|'between' }
export interface DateRangeFilterDef extends FilterDefBase { kind: 'date-range' }             // between [from,to]
export interface CustomFilterDef extends FilterDefBase {
  kind: 'custom'
  encode: (value: unknown) => string            // URL 序列化
  decode: (raw: string) => unknown
  toFilter: (value: unknown) => FilterTree
  defaultValue?: unknown
}

// 客户端求值器（client 模式 / server=false 的字段）
export function applyFilterTree<T>(rows: T[], tree: FilterTree | undefined, defs: FilterDef[]): T[]
export function evaluateLeaf<T>(row: T, leaf: FilterLeaf): boolean   // 日期比较按时间戳；contains 大小写不敏感

// 草稿/应用分离的纯逻辑
export function diffFilters(draft: FilterTree | undefined, applied: FilterTree | undefined): boolean
```

**URL 编码**（list 模块实现，flat 优先、可读性第一）：

- 简单模式（FilterLeaf 平铺）：每个 field 一个参数。多值 `,` 连接（`status=running,failed`）；范围 `..`（`created=2024-01-01..2024-06-30`）。
- 高级模式（含嵌套/or 的树）：整体编码进 `f` 参数（`encodeURIComponent(JSON.stringify(minimalTree))`）。
- 同一 field 的多个叶子在简单模式下不允许（升级到高级模式）。

---

## 3. list/ —— useResourceTable 与 URL 状态

```ts
export type ListMode = 'client' | 'server-offset' | 'server-cursor' | 'load-more'

export interface UseResourceTableOptions<TData> {
  resource: Resource<TData, any, any>
  mode: ListMode
  columns: ColumnDef<TData>[]                  // TanStack Table v9（由调用方或 L4 生成）
  filters?: FilterDef[]
  search?: { enabled?: boolean; fields?: string[]; debounceMs?: number }  // fields 用于 client 模式子串匹配
  sort?: { initial?: SortSpec[]; multi?: boolean }                        // multi 默认 true
  pagination?: { initialPageSize?: number; pageSizeOptions?: number[] }   // 默认 20 / [10,20,50,100]
  permanentFilters?: FilterTree                // 不可被 UI 修改，进 query 不进 URL 可见区（编码时合并）
  syncWithLocation?: boolean                   // 默认 true；false 时状态留在内存（测试/嵌入场景）
  facets?: string[]                            // 请求计数的字段
  queryOptions?: { staleTime?: number; refetchInterval?: number | false }
}

export interface ResourceTableState {
  search: string
  filters: FilterTree | undefined              // 已应用
  sort: SortSpec[]
  page: number                                 // offset: 页码；cursor/load-more: 已加载页数
  pageSize: number
}

export interface ResourceTableResult<TData> {
  table: Table<TData>                          // TanStack Table 实例（状态已接线）
  query: UseQueryResult<Page<TData>>
  state: ResourceTableState
  setSearch(v: string): void                   // 内部防抖后进 URL
  applyFilters(tree?: FilterTree): void        // 应用并回第 1 页
  setSort(next: SortSpec[]): void              // 变化回第 1 页
  setPage(n: number): void
  setPageSize(n: number)
  reset(): void
  cursorStack: string[]                        // cursor 模式：页 token 栈（内存态，不进 URL）
  loadMore(): void                             // load-more 模式
  totalRows: number | undefined
  facetData: FacetResult[] | undefined
  clientRows: TData[] | undefined              // client 模式：过滤排序分页后的最终行
}
```

行为规格（验收点）：

1. **URL 即事实源**：`syncWithLocation` 时全部状态经 zod schema 读写当前路由 search params（见 createListSearchSchema）。过滤器/排序变化自动回第 1 页；搜索防抖（默认 250ms）。
2. **client 模式**：一次 `list({ pageSize: clientFetchSize(默认500) })` 整取（带 search/filters/sort 参数与否由适配器决定，客户端用 applyFilterTree + 排序 + 切片兜底）；页码越界自动钳制。
3. **server-offset**：params 含 `page/pageSize/sort/filters/search`；翻页 `placeholderData: keepPreviousData`。
4. **server-cursor**：内存 token 栈；`page`（URL）为序数仅作展示与恢复提示；深链到无栈页码时回退第 1 页（已知限制，文档注明）。
   M2 实现语义（满足「前进后退无重复请求」验收）：栈在过滤会话内只追加（append-only）——
   后退不物理弹栈而是指针回移（keyset 页不可变 → 直接缓存命中零请求）；q/filters/sort/pageSize
   等重置类提交清空栈。load-more 同样适用深链钳制。
5. **load-more**：累计 rows 拼接；`page` 为已加载页数；`loadMore()` 用 lastCursor。
6. **refresh**：`query.refetch()`；轮询用 `queryOptions.refetchInterval`；新数据检测见 §9。

```ts
export function createListSearchSchema(cfg: {
  search?: boolean; filters?: FilterDef[]; sort?: { multi?: boolean }
  pagination?: { pageSizeOptions?: number[] }
}): StandardSchema   // 供路由 validateSearch 使用；解析 q/f/<field>…/sort/page/size/view
// 所有字段 .catch() 兜底坏值不中断导航（缺省/坏值 → undefined → 序列化时键被丢弃，URL 不带默认值噪音）
```

**配套导出（M2 增补）**：`listTableFeatures`（v9 显式注册的共享 features 集：sorting/pagination/
rowSelection/expanding/columnSizing/columnResizing/columnOrdering/columnVisibility + 对应 row models）、
`createListColumnHelper<TData>()`、类型 `ListTable<TData>` / `ListColumnDef<TData>`。
`useResourceTable` 结果额外暴露 `searchDraft`（防抖前的受控输入值）与 `effectiveFilters`
（含 permanentFilters 合并后的请求树）。`sort.initial` 仅在 `syncWithLocation: false` 时生效；
URL 模式下排序事实源是 URL（无 sort 参数即未排序）。

**M4 增补（分组/树形）**：
- `listTableFeatures` 追加 `columnGroupingFeature` + `rowAggregationFeature` +
  `groupedRowModel: createGroupedRowModel()` + `aggregationFns`（sum/avg[=mean]/count/min/max/…）。
  v9.3 实测**没有** `rowGroupingFeature` 导出 —— 分组由 columnGroupingFeature 提供。
- `UseResourceTableOptions` 新增：
  - `getSubRows?: (row, index) => TData[] | undefined`（树形子行；透传 TanStack 同名 option）
  - `grouping?: { columns?: GroupingState; onChange?: (next) => void }`（受控分组列；宿主可写 URL）
  - useTable 侧固定 `groupedColumnMode: false`（分组列不自动前移重排 —— reorder 模式在受控
    state 组合下会反复写 columnOrder 死循环；分组行渲染由 blocks data-table 横跨整行承担）。
- 列 meta 约定：`ListColumnMeta = { cell?: string; enumValues?: string[]; … }`（`meta.cell` 是
  inferColumns 推断出的语义渲染标记，blocks cellFor 消费）。

**saved views（命名视图）**：

```ts
export interface SavedView { id: string; name: string; search: string }  // search = 查询串本身
export function useSavedViews(resourceKey: string): {
  views: SavedView[]; save(name: string): SavedView     // 以当前 URL 查询段保存
  apply(view: SavedView): void                          // 导航到该查询段
  remove(id: string): void; update(id, name): void
}   // localStorage key: `fc:view:<resourceKey>`；save 时与当前查询相同的视图去重
```

---

## 4. reference/ —— 关联数据

```ts
export function useReference<TData>(resource: Resource<TData, any, any>, ids: string[]): {
  data: Record<string, TData | undefined>
  isLoading: boolean
}   // 去重 → 优先 client.getMany → 否则 list+in 过滤分块(50)；queryKey [name, tenant, 'many', idsSorted]
export function useReferenceLabel<TData>(
  resource: Resource<TData, any, any>,
  ids: string[],
  getIdLabel?: (row: TData) => string,
): {
  labels: Record<string, string>       // id → label（缺省 defaultReferenceLabel：name ?? title ?? id，空串逐级回落）
  data: Record<string, TData | undefined>
  isLoading: boolean
}
export function defaultReferenceLabel(row: Record<string, unknown>): string   // M6-B label 工具单点化

export interface ReferenceSelectProps (blocks 层组件的 core 约定) {
  resource: Resource<any, any, any>
  value: string | string[] | undefined
  onChange(v: string | string[]): void
  multiple?: boolean
  searchToFilter?: (q: string) => FilterTree            // 预留（当前实现直接走 ListParams.search）
  enableAfterChars?: number                              // 默认 0（即始终取选项）
  initialPageSize?: number                               // 默认 25
  allowCreate?: { render: (props: { onCreated: (id: string) => void }) => ReactNode }
  placeholder?: string
}
```

---

## 5. form/ —— useResourceForm（宿主无关）

```ts
export interface UseResourceFormOptions<TData> {
  resource: Resource<TData, any, any>
  id?: string                                   // 有值 = edit 模式（自动 useOne 取数填充）
  schema: StandardSchema                        // zod v4 直传
  defaultValues: Partial<TData>
  mutationMode?: MutationOpts<any>['mutationMode']
  redirect?: 'list' | 'detail' | 'stay' | ((ctx: { mode; data: TData }) => string)
  // 默认 'list'；相对路径约定（TanStack Router 相对导航）：create+list → '..'；create+detail → '../<id>'；
  // edit+list → '../..'；edit+detail → '..'；函数形态返回显式路径（绝对/相对均可）
  autosave?: { enabled?: boolean; debounceMs?: number }   // 草稿 localStorage：`fc:draft:<resource>:<id|new>`；debounce 默认 800ms
  submitText?: string
  versionOf?: (record: TData) => string | undefined       // edit 提交的 If-Match 版本来源；默认 record.version
  versionField?: string                                    // 默认 'version'
  onSuccess?: (data: TData) => void                        // 透传 createResource mutation onSuccess
  messages?: Partial<FormMessages>                        // M6-E 文案对象化：默认文案部分覆盖
}

/** 默认文案（M6-E；未来 i18n：宿主可注入整体 messageCatalog 覆盖全部默认文案——预留形态，机制非目标） */
export interface FormMessages { conflict: string; submitFallback: string }
export const DEFAULT_FORM_MESSAGES: FormMessages
//   conflict 默认「记录已被他人修改，请刷新后重试」（409）；submitFallback 默认「提交失败」（非 Error 兜底）

/** 防抖回调单源（M6-B 工具单点化；form 模块再出口） */
export function useDebouncedCallback<A extends unknown[]>(fn: (...args: A) => void, delayMs: number): DebouncedCallback<A>

export function useResourceForm<TData>(opts): {
  mode: 'create' | 'edit'
  initialValues: Partial<TData> | undefined     // edit 取数完成前为 undefined（宿主渲染骨架）；create 立即 = defaults（+草稿，mount 后 effect 读出合并）
  recordLoading: boolean
  draftRestored: boolean                        // 恢复过草稿 → UI 提示「已恢复未保存草稿」
  discardDraft(): void
  saveDraft(values: Partial<TData>): void       // 消费端 values 变化时调用（内部防抖写；建议仅在 isDirty 时调用）
  clearDraft(): void                            // 提交成功后由 onSubmit 内部自动调用
  onSubmit(values: TData): Promise<
    | { ok: true; data: TData }
    | { ok: false; fieldErrors: Record<string, string>; formError?: string }
  >
  isSubmitting: boolean
  // 服务端 422/400 字段错误 → fieldErrors（由适配器从 HttpError.body 提取或抛 { fields, form } 形状）
  // 409 → formError = '记录已被他人修改，请刷新后重试'
}

export function extractFieldErrors(
  err: unknown,
  messages?: Partial<FormMessages>,   // 缺省合并 DEFAULT_FORM_MESSAGES
): { fieldErrors: Record<string, string>; formError?: string }
export function draftKey(resourceName: string, id: string | undefined): string
```

**TanStack Form 绑定在 blocks 层**（`typed-form-field` block）：core 不含 UI。blocks 用 `createFormHookContexts` + `createFormHook` 组合出 `useAppForm`，字段组件基于 `useFieldContext`。**TanStack Form v1.33 实际 API 事实**（M3 spike 实跑确认，后续复用）：

- `createFormHookContexts()` → `{ fieldContext, useFieldContext, useFormContext, formContext }`（`useFormContext` 不在 `@tanstack/react-form` 顶层导出，必须用 contexts 工厂返回的那个）。
- `createFormHook({ fieldContext, formContext, fieldComponents, formComponents })` → `{ useAppForm, withForm, withFieldGroup, useTypedAppFormContext, extendForm }`。
- 字段渲染是 **children render prop**：`<form.AppField name="x">{(field) => <field.TextWidget label="…" />}</form.AppField>`（field API 上合并了 fieldComponents；v1.33 **没有** `component` prop）。
- `form.AppForm` 是纯 context Provider（不渲染 DOM `<form>`、不接 onSubmit）——外层 `<form onSubmit={(e) => { e.preventDefault(); void form.handleSubmit() }}>` 由宿主写。
- zod v4 Standard Schema 直传 `validators: { onChange: schema }`，字段错误自动分派。
- **服务端错误**：`onSubmit` 的返回值在 v1.33 被忽略；必须 `formApi.setErrorMap({ onSubmit: { fields, form } })`（或 onServer 时相）。`isGlobalFormValidationError = 对象含 "fields" 键`。
- 便利封装：blocks `typed-form-field` 导出 `TypedField`（component prop 风格）与 `VisibleWhen`（条件显隐）。

**dirty guard**：`useFormDirtyGuard(isDirty: boolean, enabled?: boolean)` → `{ blocked, proceed(), stay() }` —— 拦截 router beforeUnload + TanStack Router `useBlocker`（阻塞行内导航）；确认 UI 由 blocks 提供（`blocked === true` 时渲染确认框）。注意：提交成功后的 redirect 导航会被自身 guard 拦截 —— 宿主应在 `isSubmitting || isSubmitSuccessful` 期间禁用 guard（demo `DirtyGuardHost` 的做法）。

---

## 6. undoable 时序（data 内部，M6-E 起 ./data 唯一出口）

`scheduleUndoable` 是 createResource undoable 档的时序引擎，实现位于 `data/undoable.ts`；经 `@patterns-ui/core/data` 导出（测试与 blocks 消费用）。**M6-E 删除了 `./mutation` 兼容子路径**（曾为 M6-B 归位期的纯 re-export；未 npm publish 过，非 breaking）：

```ts
export interface UndoableToastControl { undo: () => void; dismiss: () => void; secondsLeft: number }
export interface UndoableJob {
  optimistic: () => () => void     // 应用乐观变更，返回回滚函数
  commit: () => Promise<void>
  durationMs: number
  onToast: (ctl: UndoableToastControl) => void
}
export interface ScheduleUndoable { promise: Promise<void> }
export function scheduleUndoable(job: UndoableJob): ScheduleUndoable
```

---

## 7. tenant/ —— 租户

```ts
export interface Tenant { id: string; name: string; avatarUrl?: string; plan?: string }

export interface TenantProviderProps {
  resolveTenant: (id: string) => Promise<Tenant | null>
  listTenants: () => Promise<Tenant[]>
  children: ReactNode
}
export function useTenant(): {
  tenant: Tenant | undefined
  tenantId: string | undefined            // 来自 URL 参数（由路由层传入 provider）
  tenants: Tenant[]
  isLoading: boolean
  setTenant(id: string): void             // 保留当前路径剩余部分，替换 /t/:id 前缀后导航
  invalidateTenantCache(previousId: string): void  // removeQueries 精准清旧租户缓存
}

// 记忆与校正（偏好语义，localStorage key: 'fc:last-tenant'）
export function rememberTenant(id: string): void
export function getRememberedTenant(): string | null
export function rootTenantRedirect(opts: { tenants: Tenant[] }): string
// 校正：记忆 id 不在 tenants → 返回第一个租户路径；无租户 → '/t/_none'（宿主决定空态页）
```

路由形态：业务路由位于 `/t/$tenantId/...` 布局路由下；布局组件从 `useParams` 取 `$tenantId` 注入 TenantProvider。queryKey 隔离由 createResource(tenantScoped) 自动完成。

---

## 8. auth/ —— 认证与权限

```ts
export interface AuthUser { id: string; name: string; email: string; avatarUrl?: string; role?: string; permissions?: string[] }

export interface AuthProviderProps {
  provider: {
    login(credentials: unknown): Promise<AuthUser>
    logout(): Promise<void>
    check(): Promise<{ authenticated: boolean; user?: AuthUser }>
  }
  onUnauthorized?: () => void               // 401 全局回调（清态 + 跳登录）
  children: ReactNode
}
export function useAuth(): {
  user: AuthUser | undefined; isAuthenticated: boolean; isLoading: boolean
  login(credentials: unknown): Promise<AuthUser>; logout(): Promise<void>
}

// 路由守卫（TanStack Router beforeLoad 用）
export function requireAuth(): (ctx: BeforeLoadCtx) => Promise<Redirect | void>
//   未认证 → redirect({ to: '/auth/sign-in', search: { next: 当前路径+查询 } })
export function requireRole(allow: string[] | ((user: AuthUser) => boolean)): (ctx) => Promise<Redirect | void>

// 权限（fail-closed）
export function useCan(): (action: string, resource?: string) => boolean
//   permissions 含 '*' 或 'resource.action' 或 'resource:*' 才放行；user/permissions 缺失一律 false
export function filterNavByCan<T extends { canAccess?: (action: string, resource?: string) => boolean }>(items: T[]): T[]
```

---

## 9. task/ 与轮询刷新

```ts
export interface TaskState { id: string; state: 'queued'|'running'|'succeeded'|'failed'; progress?: number; error?: string }
export function isTerminal(state: TaskState['state']): boolean   // succeeded / failed
export function taskIdOf(ref: unknown): string | undefined      // { taskId } | { id } | { task: { id } } | 字符串

export function useTaskSubmit(getTask: (ref: unknown) => Promise<TaskState>, opts?: {
  pollIntervalMs?: number                   // 默认 1500
  onDone?: (t: TaskState) => void
}): { submit(trigger: () => Promise<unknown>): Promise<TaskState> }
//   trigger() 拿到 { taskId } 后轮询至终态；组件卸载停止（返回最后已知状态）；响应缺 taskId 抛错
export function useTaskPoll(taskId: string | undefined, getTask: (id: string) => Promise<TaskState>, opts?: {
  intervalMs?: number                       // 默认 1500
  enabled?: boolean                         // 默认 true
  onDone?: (t: TaskState) => void
}): TaskState | undefined
//   每次.tick 取状态；终态停止；taskId 变化重置；卸载清理定时器

export function useNewItemsSignal<TRow>(query: UseQueryResult<Page<TRow>>, opts?: {
  key?: (row: TRow) => string               // 默认 row.id
}): { newCount: number; acknowledge(): void }
//   轮询刷新发现 rows 首部出现新 key 且未确认 → 计数；acknowledge = refetch + 清零。不自动插行（防跳动）。
```

---

## 10. inline/ —— 行内编辑 changeSet

```ts
export function useInlineEdit<TData>(opts: {
  rows: TData[]
  getId: (row: TData) => string
  commit: (changes: { id: string; patch: Partial<TData> }[]) => Promise<BulkResult | void>
}): {
  getCell(id: string, field: string): { value: unknown; isDirty: boolean; set(v: unknown): void }
  dirtyCount: number
  changes: { id: string; patch: Partial<TData> }[]
  commit(): Promise<BulkResult | void>
  revert(): void
}
```

---

## 11. datetime/ —— 时间单源

```ts
export interface DateTimePrefs { timeZone?: string; hour12?: boolean; absolutePattern?: 'full'|'date'|'datetime' }
export function useDateTimePrefs(): { prefs: DateTimePrefs; setPrefs(p: DateTimePrefs): void }
//   localStorage key 'fc:datetime'；默认 timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
export function formatAbsolute(iso: string | number | Date, prefs: DateTimePrefs): string
export function formatRelative(iso: string | number | Date, now?: number): string   // 'just now'/'5m ago'/'2h ago'/'3d ago'/绝对回退
export function useNow(intervalMs?: number): number                                 // 默认 30s，供相对时间活渲染
//   Intl.DateTimeFormat 按 (tz,opts) 键缓存；DST 由 Intl 正确处理（自研仅做缓存与相对计算）
export function isIsoDate(value: string): boolean   // M6-B 单点化：`YYYY-MM-DD` 或带 T/空格 时间部分
```

**ISO 正则重叠决策（M6-E，有意保留两套）**：`isIsoDate`（宽松：`/^\d{4}-\d{2}-\d{2}([T ].*)?$/`）与 resource `inferColumns` 的内部 `ISO_RE`（严格：时间部分必须 `T` 分隔且 `HH:MM[:SS[.fff]]` 结构合法、可带 `Z/±HH:MM`）语义不同、**各自正确**——前者服务 filters 的 `comparable()`（尽力归一化宿主数据：空格分隔串也尝试 `Date.parse`，解析失败自然回落），后者服务列类型分类（整列渲染决策，误判代价高、必须严形状）。收口为一套会让二者之一变错，故两处注释显式记录保留理由（packages/core/src/datetime/index.ts 与 resource/index.ts 同步标注）。

---

## 12. router/ —— 面包屑与路由胶水

```ts
// 路由约定：staticData: { title: string }（文件路由里声明）
export interface CrumbSegment { label: string; to?: string }
export function useCrumbs(resolve?: {
  tenant?: (id: string) => string | undefined      // 租户段反查名称（配合 useTenant 数据）
  idFallback?: (seg: string) => string | undefined // 长段截断等
}): CrumbSegment[]
//   遍历 matches：staticData.title 优先；租户段调 resolve.tenant；其余段原样（>20 字符截断）
```

---

## 13. resource/ —— L4 defineResource

```ts
export interface ResourceFormDef { schema: StandardSchema; sections?: { title: string; description?: string; fields: string[] }[]; host?: 'page'|'sheet'|'dialog' }
export interface ResourceShowDef { sections?: { title: string; items: { label: string; field: string; cell?: string }[] }[]; tabs?: { id: string; label: string; kind: 'sections'|'sub-resource'|'custom'; resource?: string }[] }

export interface ResourceDef<TData = any> {
  name: string                                 // 复数 kebab：'services'
  singular?: string                            // 'service'（用于文案）
  label?: string                               // 列表/导航标题（缺省 name 首字母大写）
  client: ResourceClient<TData, any, any>
  columns: ColumnDef<TData>[]                  // 或经 inferColumns 生成
  filters?: FilterDef[]
  list?: { mode?: ListMode; pageSize?: number; facets?: string[] }
  form?: ResourceFormDef
  show?: ResourceShowDef
  parent?: { resource: string; param: string } // 子资源嵌套：parent.resource='services', parent.param='serviceId'
  nav?: { group: string; icon?: string; order?: number }
  canAccess?: (user: AuthUser) => boolean
  tenantScoped?: boolean                       // queryKey 是否含租户段（默认 true；与 createResource 一致）
}

// getId 编译期约束（M6-C）：TData 不带 `id: string` 主键时 def 必须显式声明 getId，
// 否则类型层直接报错（运行时 String(row.id) 的 silent fallback 不再藏在类型层之下）：
//   type RequireGetId<TData> = TData extends { id: string } ? unknown : { getId: (row: TData) => string }
//   export type ResourceDef<TData> = ResourceDefShape<TData> & RequireGetId<TData>
// list.pageSize 是页大小唯一真相（M6-C 单源）：直灌 useResourceTable 缺省与路由 schema
// （def 值不在 UI 档位内也合法；非法 size 钳制回它，而非回落 options[0]）。

export function defineResource<TData>(def: ResourceDef<TData>): ResourceDef<TData>

// 文件路由内使用（不生成路由树，输出 options 供消费）：
export function resourceListRouteOptions(def): {
  validateSearch: StandardSchema                // createListSearchSchema 按 def 生成
  staticData: { title: string }
  beforeLoad?: (ctx) => Promise<Redirect | void>   // 含 requireRole/canAccess 检查
}
export function resourceDetailRouteOptions(def): { staticData: { title: string }; loader?: ... }

// 视图工厂（blocks 层组件 + def → 页面 ReactNode）由 registry 的 list-page/detail-page block 提供
// core 只提供 def 与 options 工厂 + 推断：

export function inferColumns(sample: Record<string, unknown>[]): { columns: ColumnDef<any>[]; report: string }
//   类型推断：ISO 日期→cell-time；uuid/短 hex→cell-id；boolean→cell-boolean；
//   枚举型 string（distinct ≤ 12 且非 name/title 类自由文本、平均长度 ≤24）→cell-enum-badge；
//   number→cell-number；含 @ →cell-user
//   推断结果落在列 meta.cell（ListColumnMeta）；渲染由 blocks cellFor 消费（core 不含 UI）
//   report = 可打印的生成代码（dev-only Guesser：console.info(report)）
export function inferFormFields(schema: z4 schema | sample[]): { fields: { name; widget; label }[]; report: string }
//   zod 形状优先（enum→select、boolean→switch、record→kv-pairs、datetime 检查→date、
//   description 类字段→textarea）；数组形态回落 inferColumns 的类型映射
export async function printGuess(def: ResourceDef): Promise<void>   // dev-only：拉一页样本 console.info 推断报告
export function navFromResources(defs: ResourceDef[], user?: AuthUser): { group: string; items: { name; label; to; icon?; order? }[] }[]
//   to = `/${name}`（相对租户根；宿主拼 /t/:tid 前缀）；组内 order 排序、组间按最小 order；
//   canAccess fail-closed（user 缺失且有 canAccess → 隐藏）

// list 模块配套（M6-C）：UI 档位表补入缺省页大小（升序去重）——展示位把 def.list.pageSize
// 纳入选项；档位只是展示集合，不反向成为缺省值/请求 size 的来源
export function withPageSizeOption(options: number[], size: number | undefined): number[]
export const DEFAULT_PAGE_SIZE: number            // 20（未配置时的唯一缺省定义点）
export const DEFAULT_PAGE_SIZE_OPTIONS: number[]  // [10, 20, 50, 100]
```

---

## 14. theme/ —— 主题

```ts
export interface ThemeProviderProps {
  defaultTheme?: 'light' | 'dark' | 'system'   // 默认 'dark'（偏好：暗色优先）
  storageKey?: string                          // 'fc:theme'
  defaultPreset?: string                       // 默认 'default'
  children: ReactNode
}
export function useTheme(): {
  theme: 'light'|'dark'|'system'; setTheme(t): void
  preset: string; setPreset(id: string): void  // 写 localStorage 'fc:preset' + html[data-preset]
}
//   实现：next-themes（attribute="data-theme"）+ 自管 data-preset 属性。
//   阻塞脚本注入助手（防闪）：export function themeBlockingScript(storageKey, presetKey): string
//   preset 的 CSS（[data-preset="x"] { --primary: ... }）由 registry theme item 分发，core 不含样式。
```

---

## 15. storage/ —— localStorage 统一存储（M6-B 新增）

偏好语义本地持久化的单点收敛（core 模块与 blocks 禁止再裸读写 localStorage；防闪内联脚本除外——它无法 import 本模块，三处同步由 demo guards G6 校验）：

```ts
export interface StorageMigrateContext { fromVersion: number }   // 0 = 信封化之前的裸格式
export interface CreateStorageOptions {
  version?: number                                  // 默认 1；读侧旧版本经 migrate 升级
  migrate?: (stored: unknown, ctx: StorageMigrateContext) => unknown
  //   缺省时旧格式直接弃用（显式弃用决策）；迁移结果仍须过 schema 校验，失败即弃用
  tenantId?: string                                 // 提供后最终 key 为 `${key}:${tenantId}`（租户段拼装单点）
}
export interface Storage<TData> {
  readonly fullKey: string                          // 最终存储 key（含租户段；诊断/测试用）
  read(): TData | undefined                         // 无数据/坏值/未迁移旧格式/未来版本（降级运行）→ undefined
  write(value: TData): void                         // 写入信封；非浏览器环境静默降级
  remove(): void
}
export function createStorage<TData>(
  key: string,                                      // 遵循 `fc:<域>:<标识>` 约定（工厂产出）
  schema: z.ZodType<TData>,                         // 读出校验（坏值/超集弃用回落缺省）
  opts?: CreateStorageOptions,
): Storage<TData>
//   信封格式 `{ v: <version>, d: <data> }`；读写均 try/catch（隐私模式/配额静默降级）。
//   消费方：datetime 偏好、tenant 记忆、form 草稿、savedViews、theme preset 等。
```

---

## 16. 导出与构建

- `packages/core` 用 tsup 构建：**ESM + CJS 双格式**（`.js`/`.d.ts` 与 `.cjs`/`.d.cts`，attw node16 双向必需）、dts、sourcemap、external 全部依赖；`exports` 按模块子路径映射（`.`、`./data`、`./list`、`./filters`、`./form`、`./reference`、`./tenant`、`./auth`、`./router`、`./task`、`./inline`、`./datetime`、`./resource`、`./theme`、`./storage`；`./mutation` 已于 M6-E 删除）。
- 所有 hook 浏览器 API 访问收敛 effect/事件内；导出 `useMounted()` 惯例 helper。
- 包名 `@patterns-ui/core`，scope 内后续包遵循 `@patterns-ui/*`（如 @patterns-ui/eslint-plugin）。
- dev 消费形态：demo 的 vite dev 把 `@patterns-ui/core` alias 到 workspace 源码（干净 clone `pnpm install && pnpm dev` 即起）；build/typecheck 消费 dist（与真实宿主一致）。
