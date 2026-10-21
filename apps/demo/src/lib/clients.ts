import type { BulkResult, ListParams, Page, ResourceClient } from "@fleetly/ui-component-core/data";
import { type FilterTree, minimalTree } from "@fleetly/ui-component-core/filters";
import { api } from "./api";

/**
 * demo 的 ResourceClient 适配器（fetch + Bearer + HttpError 映射 + filters 树序列化）。
 * 适配器属使用方项目（core-api §1.2）；tenantId 从 URL /t/<id>/ 前缀读取（demo 路由约定）。
 */
export function currentTenantId(): string {
  const match =
    typeof globalThis.location !== "undefined"
      ? globalThis.location.pathname.match(/\/t\/([^/]+)/)
      : null;
  return match?.[1] ?? "acme-web";
}

function buildQuery(params: ListParams): string {
  const sp = new URLSearchParams();
  if (params.page !== undefined) sp.set("page", String(params.page));
  sp.set("pageSize", String(params.pageSize));
  if (params.cursor !== undefined) sp.set("cursor", params.cursor);
  if (params.search !== undefined && params.search !== "") sp.set("q", params.search);
  if (params.sort !== undefined && params.sort.length > 0) {
    sp.set("sort", params.sort.map((s) => `${s.field}:${s.direction}`).join(","));
  }
  if (params.filters !== undefined) {
    const minimal = minimalTree(params.filters);
    if (minimal !== undefined) sp.set("f", JSON.stringify(minimal));
  }
  if (params.facets !== undefined && params.facets.length > 0) {
    sp.set("facets", params.facets.join(","));
  }
  return sp.toString();
}

/** 通用 REST 资源客户端（services / audit-events 共用形态） */
export function createRestClient<TData, TCreate, TUpdate>(
  collectionPath: (tenantId: string) => string,
  opts: { withVersionConflict?: boolean } = {},
): ResourceClient<TData, TCreate, TUpdate> {
  const base = () => `${collectionPath(currentTenantId())}`;
  return {
    list: async (params: ListParams) => {
      const query = buildQuery(params);
      return api<Page<TData>>(`${base()}?${query}`);
    },
    get: async (id: string) => api<TData>(`${base()}/${encodeURIComponent(id)}`),
    create: async (vars: TCreate) => {
      const row = await api<unknown>(base(), { method: "POST", body: JSON.stringify(vars) });
      return row as TData;
    },
    update: async (id: string, vars: TUpdate, updateOpts?: { version?: string }) =>
      api<TData>(`${base()}/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(vars),
        ...(opts.withVersionConflict && updateOpts?.version !== undefined
          ? { headers: { "if-match": String(updateOpts.version) } }
          : {}),
      }),
    delete: async (id: string) => {
      await api<void>(`${base()}/${encodeURIComponent(id)}`, { method: "DELETE" });
    },
    bulkDelete: async (ids: string[]) =>
      api<BulkResult>(`${base()}/bulk-delete`, { method: "POST", body: JSON.stringify({ ids }) }),
    bulkUpdate: async (ids: string[], vars: TUpdate) =>
      api<BulkResult>(`${base()}/bulk-update`, {
        method: "POST",
        body: JSON.stringify({ ids, vars }),
      }),
  };
}

/** 按当前应用状态全量取数（CSV 导出用：逐页拉齐，上限 20 页防失控） */
export async function fetchAllForExport<TData>(
  client: ResourceClient<TData, unknown, unknown>,
  params: Omit<ListParams, "page" | "cursor">,
  maxPages = 20,
): Promise<TData[]> {
  const rows: TData[] = [];
  let page = 1;
  for (;;) {
    const result = await client.list({ ...params, page, pageSize: 100 });
    rows.push(...result.rows);
    const total = result.total;
    if (total !== undefined) {
      if (rows.length >= total || result.rows.length === 0) break;
    } else if (result.nextCursor === undefined || result.rows.length === 0) {
      break;
    }
    page += 1;
    if (page > maxPages) break;
  }
  return rows;
}

// ---------------------------------------------------------------------------
// M3：cursor 列表（deployments keyset）与普通 REST 的 cursor 变体
// ---------------------------------------------------------------------------

/** cursor 分页版 REST 客户端（list 走 ?cursor=；query 构造同 createRestClient） */
export function createCursorClient<TData, TCreate, TUpdate>(
  collectionPath: () => string,
): ResourceClient<TData, TCreate, TUpdate> {
  return {
    list: async (params: ListParams) => {
      const query = buildQuery(params);
      return api<Page<TData>>(`${collectionPath()}?${query}`);
    },
    get: async (id: string) => api<TData>(`${collectionPath()}/${encodeURIComponent(id)}`),
    create: async (vars: TCreate) => {
      const row = await api<unknown>(collectionPath(), {
        method: "POST",
        body: JSON.stringify(vars),
      });
      return row as TData;
    },
    update: async (id: string, vars: TUpdate) =>
      api<TData>(`${collectionPath()}/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(vars),
      }),
  };
}

/** 长任务触发 + 状态查询（POST 响应 { taskId } → GET /api/tasks/:id 轮询） */
export async function getTask(taskId: string): Promise<{
  id: string;
  state: "queued" | "running" | "succeeded" | "failed";
  progress?: number;
  error?: string;
}> {
  return api(`/api/tasks/${encodeURIComponent(taskId)}`);
}

export type { FilterTree };
