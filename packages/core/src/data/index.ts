/**
 * core/data —— 数据契约与 createResource（docs/core-api.md §1）。
 *
 * queryKey 约定：`[name, tenantId?, 'list', params]` / `[name, tenantId?, 'detail', id]`。
 * 失效规则：create/bulk → 失效本资源全部 list；update → list + 该 id detail；
 * delete/bulkX → list + detail。mutationMode 三档（pessimistic/optimistic/undoable）。
 */
import {
  keepPreviousData,
  type UseMutationResult,
  type UseQueryResult,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { FilterTree, SortSpec } from "../filters";
import { useTenantOptional } from "../tenant";
import { detailKey, detailKeyPrefix, listKey, listKeyPrefix, scopeOf } from "./query-keys";
import { scheduleUndoable, type UndoableToastControl } from "./undoable";

export type {
  FilterLeaf,
  FilterNode,
  FilterOperator,
  FilterTree,
  SortDirection,
  SortSpec,
} from "../filters";

// queryKey 工厂公共出口（docs/core-api.md §1 queryKey 约定；M6-B 单源钉死，
// data/reference 内部与宿主失效逻辑全部走同一实现）。*KeyPrefix 供失效用
// （前缀匹配任意 params / 任意 id）。
export { detailKey, detailKeyPrefix, listKey, listKeyPrefix, manyKey } from "./query-keys";

// ---------------------------------------------------------------------------
// 基础类型（docs/core-api.md §1.1）
// ---------------------------------------------------------------------------

export interface FacetBucket {
  value: string;
  count: number;
}

export interface FacetResult {
  field: string;
  buckets: FacetBucket[];
}

export interface Page<T> {
  rows: T[];
  /** offset 模式应提供；cursor 模式可缺省 */
  total?: number;
  /** cursor 模式：无值即最后一页 */
  nextCursor?: string;
  /** 请求了 facets 时返回 */
  facets?: FacetResult[];
}

export interface ListParams {
  /** offset 模式，1-based */
  page?: number;
  pageSize: number;
  /** cursor 模式 */
  cursor?: string;
  sort?: SortSpec[];
  filters?: FilterTree;
  search?: string;
  /** 需要返回计数的 facet 字段名 */
  facets?: string[];
}

export interface BulkResult {
  /** ids */
  succeeded: string[];
  failed: { id: string; error: unknown }[];
}

export interface UpdateOptions {
  version?: string | number;
}

export interface ResourceClient<TData, TCreate = Partial<TData>, TUpdate = Partial<TData>> {
  list(params: ListParams): Promise<Page<TData>>;
  get(id: string): Promise<TData>;
  create?(vars: TCreate): Promise<TData>;
  /** 409 由实现方抛 HttpError(409) */
  update?(id: string, vars: TUpdate, opts?: UpdateOptions): Promise<TData>;
  delete?(id: string): Promise<void>;
  /** 可选；缺省用 list + in 过滤分块（每块 50）兜底 */
  getMany?(ids: string[]): Promise<TData[]>;
  bulkDelete?(ids: string[]): Promise<BulkResult>;
  bulkUpdate?(ids: string[], vars: TUpdate): Promise<BulkResult>;
}

/** getMany 兜底：list + in 过滤分块（每块 50），最后按 ids 去重收口 */
export async function getManyViaList<TData>(
  client: ResourceClient<TData, unknown, unknown>,
  ids: string[],
  getId: (row: TData) => string,
): Promise<TData[]> {
  const unique = [...new Set(ids)];
  const out: TData[] = [];
  const chunkSize = 50;
  for (let i = 0; i < unique.length; i += chunkSize) {
    const chunk = unique.slice(i, i + chunkSize);
    const page = await client.list({
      pageSize: chunk.length,
      filters: { field: "id", op: "in", value: chunk },
    });
    out.push(...page.rows);
  }
  const seen = new Set<string>();
  return out.filter((row) => {
    const id = getId(row);
    if (seen.has(id) || !unique.includes(id)) return false;
    seen.add(id);
    return true;
  });
}

// ---------------------------------------------------------------------------
// HttpError（M1 起）
// ---------------------------------------------------------------------------

/** 细分：401 未认证 / 403 无权限 / 404 不存在 / 409 冲突 / >=5xx 服务端 / 其它 */
export type HttpErrorKind =
  | "unauthorized"
  | "forbidden"
  | "not-found"
  | "conflict"
  | "server"
  | "other";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = "HttpError";
  }

  get kind(): HttpErrorKind {
    if (this.status === 401) return "unauthorized";
    if (this.status === 403) return "forbidden";
    if (this.status === 404) return "not-found";
    if (this.status === 409) return "conflict";
    if (this.status >= 500) return "server";
    return "other";
  }
}

// ---------------------------------------------------------------------------
// createResource
// ---------------------------------------------------------------------------

export interface MutationOpts<TVars> {
  /** 默认 pessimistic */
  mutationMode?: "pessimistic" | "optimistic" | "undoable";
  /** undoable 默认 5000 */
  undoDurationMs?: number;
  /** 自定义成功回调（替代默认 toast 约定的钩子位） */
  onSuccess?: (data: unknown, vars: TVars) => void;
  /**
   * undoable 档的 toast 回调位（core 不含 UI；blocks 层 mutation helper 接住倒计时/撤销）。
   * 每秒回调，secondsLeft 递减；undo() 撤销并还原缓存；dismiss() 立即提交。
   */
  onUndoableToast?: (ctl: UndoableToastControl) => void;
}

export interface ResourceQueryOptions {
  staleTime?: number;
  refetchOnWindowFocus?: boolean;
}

export interface Resource<TData, TCreate = Partial<TData>, TUpdate = Partial<TData>> {
  readonly name: string;
  readonly client: ResourceClient<TData, TCreate, TUpdate>;
  /** true 时 queryKey 自动含当前租户 */
  readonly tenantScoped: boolean;
  readonly getId: (row: TData) => string;

  useList(
    params: ListParams & {
      enabled?: boolean;
      placeholderData?: "keep";
      /** 逐调用覆盖（缺省回落 createResource cfg.queryOptions） */
      staleTime?: number;
      refetchInterval?: number | false;
    },
  ): UseQueryResult<Page<TData>>;
  useOne(id: string | undefined, opts?: { enabled?: boolean }): UseQueryResult<TData>;

  useCreate(opts?: MutationOpts<TCreate>): UseMutationResult<TData, Error, TCreate>;
  useUpdate(
    opts?: MutationOpts<UpdateVars<TUpdate>>,
  ): UseMutationResult<TData, Error, UpdateVars<TUpdate>>;
  useDelete(opts?: MutationOpts<{ id: string }>): UseMutationResult<void, Error, { id: string }>;
  useBulkDelete(
    opts?: MutationOpts<{ ids: string[] }>,
  ): UseMutationResult<BulkResult | undefined, Error, { ids: string[] }>;
  useBulkUpdate(
    opts?: MutationOpts<{ ids: string[]; vars: TUpdate }>,
  ): UseMutationResult<BulkResult | undefined, Error, { ids: string[]; vars: TUpdate }>;
}

/** update 变量：patch + 定位 id + 可选乐观并发版本（Omit 避免与 TUpdate 自带 version 字段交叉出 never） */
export type UpdateVars<TUpdate> = Omit<TUpdate, "version"> & {
  id: string;
  version?: string | number;
};

/**
 * 「任意资源」形态：blocks 公共 props（reference-field 等）只读 name/tenantScoped/getId/client，
 * 不关心 create/update 变体 —— 单点收敛渲染层的 any，逻辑层请使用具体 Resource<TData, ...>。
 */
// biome-ignore lint/suspicious/noExplicitAny: 单点收敛「任意资源」泛型（TCreate/TUpdate 对渲染层不可见；禁止在 core 逻辑内新开 any）
export type AnyResource = Resource<any, any, any>;

/**
 * 「具体行 + 松散变体」资源：useResourceTable/useResourceForm 等公共签名形态
 * （core-api §1/§3：Resource<TData, any, any> —— 变体类型由 createResource 边界收窄）。
 */
// biome-ignore lint/suspicious/noExplicitAny: 与 core-api §3 签名保持一致（Resource<TData, any, any>）
export type ResourceOf<TData> = Resource<TData, any, any>;

export interface CreateResourceConfig<TData, TCreate, TUpdate> {
  name: string;
  client: ResourceClient<TData, TCreate, TUpdate>;
  /** 默认 true；TenantProvider 存在时生效 */
  tenantScoped?: boolean;
  /** 默认 (r) => (r as any).id */
  getId?: (row: TData) => string;
  queryOptions?: ResourceQueryOptions;
}

type Scope = string | undefined;

interface CachePatch {
  /** 立即对 query cache 应用乐观变更，返回回滚函数 */
  apply: (queryClient: ReturnType<typeof useQueryClient>, tenantId: Scope) => () => void;
}

export function createResource<TData, TCreate = Partial<TData>, TUpdate = Partial<TData>>(
  cfg: CreateResourceConfig<TData, TCreate, TUpdate>,
): Resource<TData, TCreate, TUpdate> {
  const tenantScoped = cfg.tenantScoped ?? true;
  const getId =
    cfg.getId ?? ((row: TData) => (row as unknown as { id?: string }).id ?? String(row));
  const name = cfg.name;
  const client = cfg.client;

  /** 生效租户段：tenantScoped 且宿主有租户上下文时才有值（queryKey 经工厂拼装） */
  const tenantOf = (tenantId: string | undefined): Scope => (tenantScoped ? tenantId : undefined);

  const invalidateLists = (
    queryClient: ReturnType<typeof useQueryClient>,
    tenantId: Scope,
  ): void => {
    void queryClient.invalidateQueries({ queryKey: listKeyPrefix(name, tenantId) });
  };

  const invalidateDetail = (
    queryClient: ReturnType<typeof useQueryClient>,
    tenantId: Scope,
    id?: string,
  ): void => {
    void queryClient.invalidateQueries({ queryKey: detailKeyPrefix(name, tenantId, id) });
  };

  // -------------------------------------------------------------------------
  // 乐观缓存补丁
  // -------------------------------------------------------------------------

  function patchLists(
    queryClient: ReturnType<typeof useQueryClient>,
    tenantId: Scope,
    patchRow: (rows: TData[]) => TData[],
  ): () => void {
    const snapshots = queryClient.getQueriesData<Page<TData>>({
      queryKey: listKeyPrefix(name, tenantId),
    });
    for (const [key, page] of snapshots) {
      if (page === undefined) continue;
      queryClient.setQueryData<Page<TData>>(key, { ...page, rows: patchRow(page.rows) });
    }
    return () => {
      for (const [key, value] of snapshots) {
        if (value === undefined) queryClient.removeQueries({ queryKey: key });
        else queryClient.setQueryData(key, value);
      }
    };
  }

  const patchForUpdate = (id: string, vars: Partial<TData>): CachePatch => ({
    apply: (queryClient, tenantId) => {
      const rollbackDetail = (() => {
        const key = detailKey(name, id, { tenantId });
        const snapshot = queryClient.getQueryData<TData>(key);
        const current = snapshot;
        if (current !== undefined) {
          queryClient.setQueryData<TData>(key, { ...current, ...vars });
        }
        return () => {
          if (snapshot === undefined) queryClient.removeQueries({ queryKey: key });
          else queryClient.setQueryData(key, snapshot);
        };
      })();
      const rollbackLists = patchLists(queryClient, tenantId, (rows) =>
        rows.map((row) => (getId(row) === id ? { ...row, ...vars } : row)),
      );
      return () => {
        rollbackLists();
        rollbackDetail();
      };
    },
  });

  const patchForDelete = (ids: string[]): CachePatch => ({
    apply: (queryClient, tenantId) => {
      const removed = new Set(ids);
      const rollbackLists = patchLists(queryClient, tenantId, (rows) =>
        rows.filter((row) => !removed.has(getId(row))),
      );
      const detailSnapshots = ids.map((id) => {
        const key = detailKey(name, id, { tenantId });
        return { key, snapshot: queryClient.getQueryData<TData>(key) };
      });
      for (const { key } of detailSnapshots) {
        queryClient.removeQueries({ queryKey: key });
      }
      return () => {
        rollbackLists();
        for (const { key, snapshot } of detailSnapshots) {
          if (snapshot !== undefined) queryClient.setQueryData(key, snapshot);
        }
      };
    },
  });

  // -------------------------------------------------------------------------
  // mutation 引擎（三档时序）
  // -------------------------------------------------------------------------

  interface MutationPlan<TVars, TResult> {
    vars: TVars;
    patch?: CachePatch;
    commit: () => Promise<TResult>;
    /** 成功后的失效目标 */
    invalidate: (
      queryClient: ReturnType<typeof useQueryClient>,
      tenantId: Scope,
      result: TResult,
    ) => void;
  }

  function makeMutationFn<TResult, TVars>(
    queryClient: ReturnType<typeof useQueryClient>,
    tenantId: string | undefined,
    opts: MutationOpts<TVars> | undefined,
    build: (vars: TVars) => MutationPlan<TVars, TResult>,
  ): (vars: TVars) => Promise<TResult> {
    const mode = opts?.mutationMode ?? "pessimistic";
    return async (vars: TVars): Promise<TResult> => {
      const tenant = tenantOf(tenantId);
      const plan = build(vars);

      if (mode === "pessimistic" || plan.patch === undefined) {
        const result = await plan.commit();
        plan.invalidate(queryClient, tenant, result);
        return result;
      }

      if (mode === "optimistic") {
        const rollback = plan.patch.apply(queryClient, tenant);
        try {
          const result = await plan.commit();
          plan.invalidate(queryClient, tenant, result);
          return result;
        } catch (err) {
          rollback();
          throw err;
        }
      }

      // undoable：立即乐观变更 → 倒计时（toast 由 onUndoableToast 接住）→ 超时/-dismiss 真提交
      let committed: TResult | undefined;
      const { promise } = scheduleUndoable({
        optimistic: () => plan.patch?.apply(queryClient, tenant) ?? (() => {}),
        commit: async () => {
          committed = await plan.commit();
          plan.invalidate(queryClient, tenant, committed);
        },
        durationMs: opts?.undoDurationMs ?? 5000,
        onToast: opts?.onUndoableToast ?? (() => {}),
      });
      await promise;
      return committed as TResult;
    };
  }

  // -------------------------------------------------------------------------
  // Resource 对象（hooks 以对象方法形态暴露，内部各自调用 React hooks）
  // -------------------------------------------------------------------------

  const resource: Resource<TData, TCreate, TUpdate> = {
    name,
    client,
    tenantScoped,
    getId,

    useList(params) {
      const tenantId = useResourceTenantId(tenantScoped);
      const { enabled = true, placeholderData, staleTime, refetchInterval, ...listParams } = params;
      return useQuery({
        queryKey: listKey(name, listParams, { tenantId: tenantOf(tenantId) }),
        queryFn: () => client.list(listParams),
        enabled,
        placeholderData: placeholderData === "keep" ? keepPreviousData : undefined,
        ...cfg.queryOptions,
        ...(staleTime !== undefined ? { staleTime } : {}),
        ...(refetchInterval !== undefined ? { refetchInterval } : {}),
      });
    },

    useOne(id, opts) {
      const tenantId = useResourceTenantId(tenantScoped);
      return useQuery({
        queryKey: detailKey(name, id ?? "", { tenantId: tenantOf(tenantId) }),
        queryFn: () => client.get(id as string),
        enabled: id !== undefined && opts?.enabled !== false,
        ...cfg.queryOptions,
      });
    },

    useCreate(opts) {
      const queryClient = useQueryClient();
      const tenantId = useResourceTenantId(tenantScoped);
      return useMutation<TData, Error, TCreate>({
        mutationFn: makeMutationFn<TData, TCreate>(queryClient, tenantId, opts, (vars) => ({
          vars,
          commit: () => {
            if (!client.create) throw new Error("client.create is not implemented");
            return client.create(vars);
          },
          invalidate: (qc, scope) => invalidateLists(qc, scope),
        })),
        onSuccess: (data, vars) => opts?.onSuccess?.(data, vars),
      });
    },

    useUpdate(opts) {
      const queryClient = useQueryClient();
      const tenantId = useResourceTenantId(tenantScoped);
      return useMutation<TData, Error, UpdateVars<TUpdate>>({
        mutationFn: makeMutationFn<TData, UpdateVars<TUpdate>>(
          queryClient,
          tenantId,
          opts,
          (vars) => ({
            vars,
            patch: patchForUpdate(vars.id, vars as unknown as Partial<TData>),
            commit: () => {
              if (!client.update) throw new Error("client.update is not implemented");
              return client.update(vars.id, vars as unknown as TUpdate, {
                version: vars.version,
              });
            },
            invalidate: (qc, scope) => {
              invalidateLists(qc, scope);
              invalidateDetail(qc, scope, vars.id);
            },
          }),
        ),
        onSuccess: (data, vars) => opts?.onSuccess?.(data, vars),
      });
    },

    useDelete(opts) {
      const queryClient = useQueryClient();
      const tenantId = useResourceTenantId(tenantScoped);
      return useMutation<void, Error, { id: string }>({
        mutationFn: makeMutationFn<void, { id: string }>(queryClient, tenantId, opts, (vars) => ({
          vars,
          patch: patchForDelete([vars.id]),
          commit: async () => {
            await client.delete?.(vars.id);
          },
          invalidate: (qc, scope) => {
            invalidateLists(qc, scope);
            invalidateDetail(qc, scope, vars.id);
          },
        })),
        onSuccess: (data, vars) => opts?.onSuccess?.(data, vars),
      });
    },

    useBulkDelete(opts) {
      const queryClient = useQueryClient();
      const tenantId = useResourceTenantId(tenantScoped);
      return useMutation<BulkResult | undefined, Error, { ids: string[] }>({
        mutationFn: makeMutationFn<BulkResult | undefined, { ids: string[] }>(
          queryClient,
          tenantId,
          opts,
          (vars) => ({
            vars,
            patch: patchForDelete(vars.ids),
            commit: async () => (client.bulkDelete ? await client.bulkDelete(vars.ids) : undefined),
            invalidate: (qc, scope) => {
              invalidateLists(qc, scope);
              invalidateDetail(qc, scope);
            },
          }),
        ),
        onSuccess: (data, vars) => opts?.onSuccess?.(data, vars),
      });
    },

    useBulkUpdate(opts) {
      const queryClient = useQueryClient();
      const tenantId = useResourceTenantId(tenantScoped);
      return useMutation<BulkResult | undefined, Error, { ids: string[]; vars: TUpdate }>({
        mutationFn: makeMutationFn<BulkResult | undefined, { ids: string[]; vars: TUpdate }>(
          queryClient,
          tenantId,
          opts,
          (vars) => ({
            vars,
            patch: (() => {
              // ids 逐个 patch（简单合并；行数大时由宿主改走服务端聚合）
              const combined: CachePatch = {
                apply: (qc, scope) => {
                  const rollbacks = vars.ids.map((id) =>
                    patchForUpdate(id, vars.vars as unknown as Partial<TData>).apply(qc, scope),
                  );
                  return () => {
                    for (const rb of rollbacks.reverse()) rb();
                  };
                },
              };
              return combined;
            })(),
            commit: async () =>
              client.bulkUpdate ? await client.bulkUpdate(vars.ids, vars.vars) : undefined,
            invalidate: (qc, scope) => {
              invalidateLists(qc, scope);
              invalidateDetail(qc, scope);
            },
          }),
        ),
        onSuccess: (data, vars) => opts?.onSuccess?.(data, vars),
      });
    },
  };

  return resource;
}

/** tenantScoped 时读取当前租户段（无 TenantProvider 的宿主返回 undefined） */
function useResourceTenantId(tenantScoped: boolean): string | undefined {
  const ctx = useTenantOptional();
  return tenantScoped ? ctx?.tenantId : undefined;
}

/** 便捷：基于当前租户构造 queryKey 前缀（测试/调试用；实现与 queryKey 工厂同源） */
export function resourceScope(name: string, tenantId?: string): string[] {
  return [...scopeOf(name, tenantId)] as string[];
}
