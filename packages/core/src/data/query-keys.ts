/**
 * data/query-keys —— 资源 queryKey 工厂（docs/core-api.md §1 queryKey 约定）。
 *
 * 单源钉死三形：`[name, tenantId?, 'list', params]` / `[name, tenantId?, 'detail', id]` /
 * `[name, tenantId?, 'many', ids 去重排序]`。data（createResource）与 reference
 * （useReference）全部经此构造；失效（invalidate）用同源的段前缀，保证
 * 「工厂产出的 key ⊆ 失效前缀命中域」这一跨模块一致性（契约测试锁定）。
 *
 * tenantId 缺省时省略该段（不写 undefined 占位，URL/缓存序列化无噪音）。
 */

/** 资源 queryKey 前缀段：[name] 或 [name, tenantId] */
export function scopeOf(name: string, tenantId?: string): readonly unknown[] {
  return tenantId !== undefined ? [name, tenantId] : [name];
}

/** list 族失效前缀：[name, tenantId?, 'list']（命中全部 params 变体） */
export function listKeyPrefix(name: string, tenantId?: string): readonly unknown[] {
  return [...scopeOf(name, tenantId), "list"];
}

/** detail 族失效前缀：[name, tenantId?, 'detail', id?]（id 缺省 = 全部 detail） */
export function detailKeyPrefix(name: string, tenantId?: string, id?: string): readonly unknown[] {
  return id === undefined
    ? [...scopeOf(name, tenantId), "detail"]
    : [...scopeOf(name, tenantId), "detail", id];
}

export interface QueryKeyScopeOptions {
  /** 租户段（tenantScoped 资源传当前租户 id；缺省省略该段） */
  tenantId?: string;
}

/** 列表查询 key：[name, tenantId?, 'list', params] */
export function listKey(
  name: string,
  params: unknown,
  opts?: QueryKeyScopeOptions,
): readonly unknown[] {
  return [...scopeOf(name, opts?.tenantId), "list", params];
}

/** 详情查询 key：[name, tenantId?, 'detail', id] */
export function detailKey(
  name: string,
  id: string,
  opts?: QueryKeyScopeOptions,
): readonly unknown[] {
  return [...scopeOf(name, opts?.tenantId), "detail", id];
}

/** 批量引用查询 key：[name, tenantId?, 'many', ids 去重排序后]（同 ids 多处调用共享缓存） */
export function manyKey(
  name: string,
  ids: readonly string[],
  opts?: QueryKeyScopeOptions,
): readonly unknown[] {
  return [...scopeOf(name, opts?.tenantId), "many", [...new Set(ids)].sort()];
}
