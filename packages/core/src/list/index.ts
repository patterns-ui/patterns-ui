/**
 * core/list —— useResourceTable 与 URL 状态（docs/core-api.md §3）。
 *
 * 状态哲学（architecture.md §3）：查询语义（q/filters/sort/page/size）全部进 URL（zod schema
 * 兜底坏值），cursor token 栈 / 行选择 / 草稿留在内存。四模式：
 *  - client：一次整取（clientFetchSize 默认 500），applyFilterTree + 表内排序分页，页码钳制；
 *  - server-offset：page/pageSize/sort/filters/search 进请求，keepPreviousData；
 *  - server-cursor：内存 token 栈；URL page 为序数；深链无栈页码回退第 1 页；
 *  - load-more：累计拼接，page 为已加载页数。
 */

import type { UseQueryResult } from "@tanstack/react-query";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import {
  aggregationFn_count,
  aggregationFn_extent,
  aggregationFn_first,
  aggregationFn_last,
  aggregationFn_max,
  aggregationFn_mean,
  aggregationFn_median,
  aggregationFn_min,
  aggregationFn_sum,
  aggregationFn_unique,
  aggregationFn_uniqueCount,
  type ColumnDef,
  type ColumnHelper,
  columnGroupingFeature,
  columnOrderingFeature,
  columnResizingFeature,
  columnSizingFeature,
  columnVisibilityFeature,
  createColumnHelper,
  createExpandedRowModel,
  createGroupedRowModel,
  createPaginatedRowModel,
  createSortedRowModel,
  type GroupingState,
  type ReactTable,
  type RowData,
  rowAggregationFeature,
  rowExpandingFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowSortingFeature,
  type SortingState,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FacetResult, ListParams, Page, Resource } from "../data";
import { useDebouncedCallback } from "../debounce";
import {
  andTrees,
  applyFilterTree,
  decodeFiltersFromParams,
  encodeFiltersToParams,
  type FilterDef,
  type FilterTree,
  type SortSpec,
} from "../filters";
import { createStorage } from "../storage";

export type { FacetResult, ListParams, Page } from "../data";
export { useDebouncedCallback } from "../debounce";
export type { FilterDef, FilterTree, SortDirection, SortSpec } from "../filters";

// ---------------------------------------------------------------------------
// TanStack Table v9：列表场景共享 features 集（显式注册，禁止 v8 兼容层）
// ---------------------------------------------------------------------------

/**
 * v9.3 实测：分组能力由 `columnGroupingFeature` + `groupedRowModel: createGroupedRowModel()`
 * 提供（无 `rowGroupingFeature` 导出）；聚合执行器是 `rowAggregationFeature` +
 * `aggregationFns` 注册表（分组行聚合单元格与 column.getAggregationValue 共用）。
 */
export const listTableFeatures = tableFeatures({
  rowSortingFeature,
  rowPaginationFeature,
  rowSelectionFeature,
  rowExpandingFeature,
  columnOrderingFeature,
  columnSizingFeature,
  columnResizingFeature,
  columnVisibilityFeature,
  columnGroupingFeature,
  rowAggregationFeature,
  sortedRowModel: createSortedRowModel(),
  paginatedRowModel: createPaginatedRowModel(),
  expandedRowModel: createExpandedRowModel(),
  groupedRowModel: createGroupedRowModel(),
  aggregationFns: {
    sum: aggregationFn_sum,
    avg: aggregationFn_mean, // v9 无独立 avg 实现：别名到 mean
    mean: aggregationFn_mean,
    count: aggregationFn_count,
    min: aggregationFn_min,
    max: aggregationFn_max,
    median: aggregationFn_median,
    extent: aggregationFn_extent,
    unique: aggregationFn_unique,
    uniqueCount: aggregationFn_uniqueCount,
    first: aggregationFn_first,
    last: aggregationFn_last,
  },
  columnMeta: {} as ListColumnMeta,
});

export type ListTableFeatures = typeof listTableFeatures;

/**
 * 列 meta 约定：`meta.cell` 是语义渲染标记（inferColumns 推断产出 / 手写声明），
 * blocks 层 cellFor/meta 消费方读它渲染（core 不含 UI）。其余键透传。
 */
export interface ListColumnMeta {
  cell?: string;
  enumValues?: string[];
  [key: string]: unknown;
}

// biome-ignore lint/suspicious/noExplicitAny: TanStack ColumnDef 的 TValue 在 cell/render 协变位置，官方形态即 any
export type ListColumnDef<TData extends RowData> = ColumnDef<ListTableFeatures, TData, any>;
export type ListTable<TData extends RowData> = ReactTable<ListTableFeatures, TData>;
export type ListColumnHelper<TData extends RowData> = ColumnHelper<ListTableFeatures, TData>;

/** 列定义 helper（与 listTableFeatures 配套；类型经 createColumnHelper<TFeatures, TData>()） */
export function createListColumnHelper<TData extends RowData>(): ListColumnHelper<TData> {
  return createColumnHelper<ListTableFeatures, TData>();
}

// ---------------------------------------------------------------------------
// sort 参数编解码（URL 单一形态：field:asc,field2:desc）
// ---------------------------------------------------------------------------

export function formatSortParam(sort: SortSpec[]): string {
  return sort.map((s) => `${s.field}:${s.direction}`).join(",");
}

export function parseSortParam(raw: unknown, multi = true): SortSpec[] {
  if (typeof raw !== "string" || raw.trim() === "") return [];
  const specs: SortSpec[] = [];
  for (const part of raw.split(",")) {
    const [field, dir] = part.split(":");
    if (!field) continue;
    specs.push({ field, direction: dir === "desc" ? "desc" : "asc" });
    if (!multi) break;
  }
  return specs;
}

function toSortingState(sort: SortSpec[]): SortingState {
  return sort.map((s) => ({ id: s.field, desc: s.direction === "desc" }));
}

function fromSortingState(sorting: SortingState): SortSpec[] {
  return sorting.map((s) => ({ field: s.id, direction: s.desc ? "desc" : "asc" }));
}

// ---------------------------------------------------------------------------
// createListSearchSchema
// ---------------------------------------------------------------------------

export interface ListSearchSchemaConfig {
  search?: boolean;
  filters?: FilterDef[];
  sort?: { multi?: boolean };
  /**
   * pageSizeOptions 只声明 URL 合法档位（缺省 DEFAULT_PAGE_SIZE_OPTIONS）；
   * defaultPageSize（def.list.pageSize 直灌，M6-C 单源）即使不在档位内也合法。
   */
  pagination?: { pageSizeOptions?: number[]; defaultPageSize?: number };
}

export const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
/** 未配置 def.list.pageSize / pagination.initialPageSize 时的缺省页大小（唯一默认值定义点） */
export const DEFAULT_PAGE_SIZE = 20;
export const DEFAULT_SEARCH_DEBOUNCE_MS = 250;
export const DEFAULT_CLIENT_FETCH_SIZE = 500;

import { z } from "zod";

/**
 * 生成路由 validateSearch 用的 zod schema（Standard Schema 直传）。
 * 字段：q / f（树模式 JSON）/ <filter field>… / sort / page / size / view，全部 .catch() 兜底。
 */
export function createListSearchSchema(
  cfg: ListSearchSchemaConfig = {},
): z.ZodObject<Record<string, z.ZodType>> {
  // 合法 size = UI 档位 ∪ 缺省页大小（defaultPageSize 可不在档位内——def.list.pageSize 是唯一真相）
  const allowedSizes = [...(cfg.pagination?.pageSizeOptions ?? DEFAULT_PAGE_SIZE_OPTIONS)];
  const defaultPageSize = cfg.pagination?.defaultPageSize;
  if (
    defaultPageSize !== undefined &&
    defaultPageSize > 0 &&
    !allowedSizes.includes(defaultPageSize)
  ) {
    allowedSizes.push(defaultPageSize);
    allowedSizes.sort((a, b) => a - b);
  }
  const shape: Record<string, z.ZodType> = {
    // optional + catch(undefined)：缺省/坏值 → undefined（序列化时键被丢弃，URL 不带默认值噪音）
    f: z.string().optional().catch(undefined),
    sort: z.string().optional().catch(undefined),
    page: z.coerce.number().int().min(1).optional().catch(undefined),
    size: z.coerce
      .number()
      .int()
      .refine((n) => allowedSizes.includes(n), `size must be one of ${allowedSizes.join("/")}`)
      .optional()
      .catch(undefined),
    view: z.string().optional().catch(undefined),
  };
  if (cfg.search !== false) {
    shape.q = z.string().optional().catch(undefined);
  }
  for (const def of cfg.filters ?? []) {
    shape[def.field] = z.string().optional().catch(undefined);
  }
  return z.object(shape);
}

/**
 * UI 档位表补入缺省页大小（升序去重）。分页条下拉等展示位用它把 def.list.pageSize
 * 纳入选项；档位本身只是展示集合，不反向成为缺省值/请求 size 的来源（M6-C）。
 */
export function withPageSizeOption(options: number[], size: number | undefined): number[] {
  if (size === undefined || options.includes(size)) return options;
  return [...options, size].sort((a, b) => a - b);
}

// ---------------------------------------------------------------------------
// Router 访问（无 RouterProvider 宿主下安全降级；hooks 调用数量恒定）
// ---------------------------------------------------------------------------

const EMPTY_SEARCH: Record<string, unknown> = {};

interface RouterAccess {
  search: Record<string, unknown>;
  searchStr: string;
  navigateSearch: (makeNext: (prev: Record<string, unknown>) => Record<string, unknown>) => void;
}

function useRouterAccess(enabled: boolean): RouterAccess {
  let search: Record<string, unknown> = EMPTY_SEARCH;
  let searchStr = "";
  let navigate: ((opts: Parameters<ReturnType<typeof useNavigate>>[0]) => void) | undefined;
  try {
    // biome-ignore lint/correctness/useHookAtTopLevel: hook 位于 try 内是刻意的 —— 无 Router 宿主（嵌入场景）时安全降级；hook 调用顺序恒定
    const s = useRouterState({
      select: (st) => ({
        search: st.location.search as Record<string, unknown>,
        searchStr: st.location.searchStr,
      }),
    });
    if (enabled) {
      search = s.search ?? EMPTY_SEARCH;
      searchStr = s.searchStr ?? "";
    }
  } catch {
    /* 无 Router 宿主（syncWithLocation:false 嵌入场景） */
  }
  try {
    // biome-ignore lint/correctness/useHookAtTopLevel: 同上（useNavigate 无 Provider 时抛错被捕获，hook 数量恒定）
    const nav = useNavigate();
    if (enabled) navigate = nav;
  } catch {
    /* 同上 */
  }
  const navigateSearch = useCallback(
    (makeNext: (prev: Record<string, unknown>) => Record<string, unknown>) => {
      navigate?.({ search: makeNext, replace: true } as Parameters<typeof navigate>[0]);
    },
    [navigate],
  );
  return { search, searchStr, navigateSearch };
}

// ---------------------------------------------------------------------------
// useResourceTable
// ---------------------------------------------------------------------------

export type ListMode = "client" | "server-offset" | "server-cursor" | "load-more";

export interface UseResourceTableOptions<TData extends RowData> {
  // biome-ignore lint/suspicious/noExplicitAny: 与 core-api §3 签名一致（Resource<TData, any, any>）
  resource: Resource<TData, any, any>;
  mode: ListMode;
  /** TanStack Table v9 列定义（createListColumnHelper / listTableFeatures 配套） */
  columns: ListColumnDef<TData>[];
  filters?: FilterDef[];
  search?: { enabled?: boolean; fields?: string[]; debounceMs?: number };
  /** multi 默认 true */
  sort?: { initial?: SortSpec[]; multi?: boolean };
  /**
   * 页大小单源（M6-C）：initialPageSize 是缺省页大小（def.list.pageSize 直灌）——
   * 内存模式的初始值，也是 URL 无 size 参数时的缺省；未配置回落 DEFAULT_PAGE_SIZE（唯一默认值定义点）。
   * pageSizeOptions 仅是 UI 档位（分页条下拉），合法但不再反向成为缺省值/请求 size 的来源。
   */
  pagination?: { initialPageSize?: number; pageSizeOptions?: number[] };
  /** 不可被 UI 修改，进 query 不进 URL 可见区（编码时合并） */
  permanentFilters?: FilterTree;
  /** 默认 true；false 时状态留在内存（测试/嵌入场景） */
  syncWithLocation?: boolean;
  /** 请求计数的字段 */
  facets?: string[];
  queryOptions?: { staleTime?: number; refetchInterval?: number | false };
  /** client 模式一次整取的条数（默认 500） */
  clientFetchSize?: number;
  /** 树形数据：子行读取（TanStack getSubRows 透传；配合 expandedRowModel 展平） */
  getSubRows?: (row: TData, index: number) => TData[] | undefined;
  /**
   * 分组列（M4）：columns = 分组列 id（受控值优先；缺省内部 state）。
   * 变化经 onChange 回调（宿主可写进 URL）；DataTable 的分组 UI 走 table.setGrouping。
   */
  grouping?: { columns?: GroupingState; onChange?: (next: GroupingState) => void };
}

export interface ResourceTableState {
  search: string;
  filters: FilterTree | undefined;
  sort: SortSpec[];
  /** offset: 页码；cursor/load-more: 已加载页数 */
  page: number;
  pageSize: number;
}

export interface ResourceTableResult<TData extends RowData> {
  table: ListTable<TData>;
  query: UseQueryResult<Page<TData>>;
  state: ResourceTableState;
  /** 搜索输入的即时草稿（受控输入用；防抖后进 state.search/URL） */
  searchDraft: string;
  setSearch(v: string): void;
  applyFilters(tree?: FilterTree): void;
  setSort(next: SortSpec[]): void;
  setPage(n: number): void;
  setPageSize(n: number): void;
  reset(): void;
  /** cursor 模式：页 token 栈（内存态，不进 URL） */
  cursorStack: string[];
  nextPage(): void;
  prevPage(): void;
  /** load-more 模式 */
  loadMore(): void;
  totalRows: number | undefined;
  facetData: FacetResult[] | undefined;
  /** client 模式：过滤排序分页后的最终行 */
  clientRows: TData[] | undefined;
  /** 当前请求实际使用的 filters（含 permanentFilters 合并） */
  effectiveFilters: FilterTree | undefined;
}

interface InternalState {
  q: string;
  tree: FilterTree | undefined;
  sort: SortSpec[];
  page: number;
  size: number;
}

/**
 * 页大小钳制（单源语义，M6-C）：合法 = UI 档位 ∪ 缺省值；缺省值可不在档位内。
 * 兜底永远是 defaultSize（initialPageSize ?? DEFAULT_PAGE_SIZE）——不再回落 options[0]，
 * pageSizeOptions 不再反向成为数据源。
 */
function clampSize(n: unknown, options: number[], defaultSize: number): number {
  const num = typeof n === "number" ? n : Number(n);
  // num > 0：负值/零即使在档位或等于缺省值也不合法（防 def 配置负 pageSize 被直灌）
  if (Number.isFinite(num) && num > 0 && (options.includes(num) || num === defaultSize)) {
    return num;
  }
  return defaultSize;
}

function searchTreeFor<TData>(
  q: string,
  fields: string[] | undefined,
  rows: TData[],
): FilterTree | undefined {
  if (q === "") return undefined;
  if (fields !== undefined) {
    if (fields.length === 0) return undefined;
    return {
      combinator: "or",
      children: fields.map((field) => ({ field, op: "contains" as const, value: q })),
    };
  }
  // fields 未声明：对首行全部顶层字符串字段做 contains（client 模式兜底）
  const sample = rows[0] as Record<string, unknown> | undefined;
  if (sample === undefined) return undefined;
  const stringFields = Object.keys(sample).filter((k) => typeof sample[k] === "string");
  if (stringFields.length === 0) return undefined;
  return {
    combinator: "or",
    children: stringFields.map((field) => ({ field, op: "contains" as const, value: q })),
  };
}

export function useResourceTable<TData extends RowData>(
  options: UseResourceTableOptions<TData>,
): ResourceTableResult<TData> {
  const {
    resource,
    mode,
    columns,
    filters: defs = [],
    search: searchCfg = {},
    sort: sortCfg = {},
    pagination: paginationCfg = {},
    permanentFilters,
    syncWithLocation = true,
    facets,
    queryOptions,
    clientFetchSize = DEFAULT_CLIENT_FETCH_SIZE,
  } = options;

  const pageSizeOptions = paginationCfg.pageSizeOptions ?? DEFAULT_PAGE_SIZE_OPTIONS;
  /** 缺省页大小（单源）：initialPageSize（def.list.pageSize 直灌）→ DEFAULT_PAGE_SIZE；非正值回落默认 */
  const defaultPageSize =
    paginationCfg.initialPageSize !== undefined && paginationCfg.initialPageSize > 0
      ? paginationCfg.initialPageSize
      : DEFAULT_PAGE_SIZE;
  const initialSort = sortCfg.initial ?? [];
  const multiSort = sortCfg.multi ?? true;
  const debounceMs = searchCfg.debounceMs ?? DEFAULT_SEARCH_DEBOUNCE_MS;
  const router = useRouterAccess(syncWithLocation);

  // -------------------------------------------------------------------------
  // 状态源：URL（默认）或内存
  // -------------------------------------------------------------------------

  const urlState: InternalState | undefined = syncWithLocation
    ? {
        q: typeof router.search.q === "string" ? router.search.q : "",
        tree: decodeFiltersFromParams(router.search, defs),
        sort: parseSortParam(router.search.sort, multiSort),
        page:
          typeof router.search.page === "number" ? Math.max(1, Math.floor(router.search.page)) : 1,
        size: clampSize(router.search.size, pageSizeOptions, defaultPageSize),
      }
    : undefined;

  const [memState, setMemState] = useState<InternalState>({
    q: "",
    tree: undefined,
    sort: initialSort,
    page: 1,
    size: clampSize(paginationCfg.initialPageSize, pageSizeOptions, defaultPageSize),
  });

  const state: InternalState = urlState ?? memState;
  const stateRef = useRef(state);
  stateRef.current = state;

  /** 会引起回第 1 页的提交同时清空 cursor 栈 / load-more 累计 */
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [loadedPages, setLoadedPages] = useState<TData[][]>([]);

  const filterParamKeys = useMemo(() => ["f", ...defs.map((d) => d.field)], [defs]);

  const buildSearch = useCallback(
    (prev: Record<string, unknown>, next: InternalState): Record<string, unknown> => {
      const out: Record<string, unknown> = { ...prev };
      for (const key of filterParamKeys) delete out[key];
      delete out.view;
      Object.assign(out, encodeFiltersToParams(next.tree, defs));
      out.q = next.q !== "" ? next.q : undefined;
      out.sort = next.sort.length > 0 ? formatSortParam(next.sort) : undefined;
      out.page = next.page > 1 ? next.page : undefined;
      // URL 不带缺省值噪音：等于缺省页大小时省略 size（缺省单源 = defaultPageSize）
      out.size = next.size !== defaultPageSize ? next.size : undefined;
      return out;
    },
    [filterParamKeys, defs, defaultPageSize],
  );

  const commit = useCallback(
    (patch: Partial<InternalState>) => {
      const next: InternalState = { ...stateRef.current, ...patch };
      if (syncWithLocation) {
        router.navigateSearch((prev) => buildSearch(prev, next));
      } else {
        setMemState(next);
      }
    },
    [syncWithLocation, router, buildSearch],
  );

  const commitWithReset = useCallback(
    (patch: Partial<InternalState>) => {
      setCursorStack([]);
      setLoadedPages([]);
      commit({ ...patch, page: 1 });
    },
    [commit],
  );

  // 搜索防抖：searchDraft 即时更新，debounceMs 后写入状态源（useDebouncedCallback 单源，M6-B）
  const [searchDraft, setSearchDraft] = useState(state.q);
  const commitSearchDebounced = useDebouncedCallback(
    (q: string) => commitWithReset({ q }),
    debounceMs,
  );
  useEffect(() => {
    if (searchDraft === stateRef.current.q) return;
    commitSearchDebounced(searchDraft);
  }, [searchDraft, commitSearchDebounced]);

  const applyFilters = useCallback(
    (tree?: FilterTree) => commitWithReset({ tree }),
    [commitWithReset],
  );
  const setSort = useCallback(
    (next: SortSpec[]) => {
      const current = stateRef.current.sort;
      const changed =
        current.length !== next.length ||
        current.some((s, i) => s.field !== next[i]?.field || s.direction !== next[i]?.direction);
      if (changed) commitWithReset({ sort: next });
    },
    [commitWithReset],
  );
  const setPage = useCallback((n: number) => commit({ page: Math.max(1, n) }), [commit]);
  const setPageSize = useCallback(
    (n: number) => commitWithReset({ size: clampSize(n, pageSizeOptions, defaultPageSize) }),
    [commitWithReset, pageSizeOptions, defaultPageSize],
  );
  const reset = useCallback(() => {
    setSearchDraft(""); // 同步清空搜索草稿，防止防抖定时器把旧词写回
    commitWithReset({ q: "", tree: undefined, sort: [] });
  }, [commitWithReset]);
  const loadMore = useCallback(() => {
    commit({ page: stateRef.current.page + 1 });
  }, [commit]);

  // -------------------------------------------------------------------------
  // 数据取数（四模式参数构造）
  // -------------------------------------------------------------------------

  const effectiveFilters = useMemo(
    () => andTrees(state.tree, permanentFilters),
    [state.tree, permanentFilters],
  );

  const baseParams = useMemo<ListParams>(() => {
    const params: ListParams = {
      pageSize: mode === "client" ? clientFetchSize : state.size,
      search: state.q !== "" ? state.q : undefined,
      sort: state.sort.length > 0 ? state.sort : undefined,
      filters: effectiveFilters,
      facets: facets && facets.length > 0 ? facets : undefined,
    };
    if (mode === "server-offset") params.page = state.page;
    if (mode === "server-cursor" || mode === "load-more") {
      const token = state.page > 1 ? cursorStack[state.page - 2] : undefined;
      params.cursor = token;
      params.pageSize = state.size;
    }
    return params;
  }, [
    mode,
    state.q,
    state.size,
    state.page,
    state.sort,
    effectiveFilters,
    facets,
    cursorStack,
    clientFetchSize,
  ]);

  // 经 resource.useList 取数：queryKey/失效规则与 createResource 全局约定一致（租户隔离 + mutation 失效联动）
  const query = resource.useList({
    ...baseParams,
    placeholderData: mode === "client" ? undefined : "keep",
    staleTime: queryOptions?.staleTime,
    refetchInterval: queryOptions?.refetchInterval,
  });

  // -------------------------------------------------------------------------
  // cursor / load-more：token 栈维护 + 累计行
  // -------------------------------------------------------------------------

  const pageRows = query.data?.rows;

  useEffect(() => {
    if (mode !== "server-cursor" && mode !== "load-more") return;
    const data = query.data;
    if (data === undefined || query.isPlaceholderData) return;
    setCursorStack((prev) => {
      if (prev.length === stateRef.current.page - 1 && data.nextCursor) {
        return [...prev, data.nextCursor];
      }
      return prev;
    });
  }, [query.data, query.isPlaceholderData, mode]);

  useEffect(() => {
    if (mode !== "load-more") return;
    const data = query.data;
    if (data === undefined || query.isPlaceholderData) return;
    const pageIndex = stateRef.current.page - 1;
    setLoadedPages((prev) => {
      if (pageIndex === 0) return [data.rows];
      const next = prev.slice(0, pageIndex);
      next[pageIndex] = data.rows;
      return next;
    });
  }, [query.data, query.isPlaceholderData, mode]);

  // 深链到无栈页码时回退第 1 页（已知限制：cursor/load-more 位置无法从 URL 恢复；
  // load-more 的 page 是「已加载页数」，栈为空时 >1 即无意义）
  useEffect(() => {
    if ((mode !== "server-cursor" && mode !== "load-more") || !syncWithLocation) return;
    if (state.page > cursorStack.length + 1) {
      commit({ page: cursorStack.length + 1 });
    }
  }, [mode, syncWithLocation, state.page, cursorStack.length, commit]);

  // -------------------------------------------------------------------------
  // client 模式：整取后本地过滤 + 表内排序分页；页码钳制
  // -------------------------------------------------------------------------

  const clientFiltered = useMemo<TData[] | undefined>(() => {
    if (mode !== "client" || pageRows === undefined) return undefined;
    const searchCfgFields = searchCfg.fields;
    const tree = andTrees(effectiveFilters, searchTreeFor(state.q, searchCfgFields, pageRows));
    return applyFilterTree(pageRows, tree, defs);
  }, [mode, pageRows, effectiveFilters, state.q, searchCfg.fields, defs]);

  const clientTotal = clientFiltered?.length;
  useEffect(() => {
    if (mode !== "client" || clientTotal === undefined) return;
    const maxPage = Math.max(1, Math.ceil(clientTotal / stateRef.current.size));
    if (stateRef.current.page > maxPage) commit({ page: maxPage });
  }, [mode, clientTotal, commit]);

  const tableData: TData[] = useMemo(() => {
    if (mode === "client") return clientFiltered ?? [];
    if (mode === "load-more") return loadedPages.flat();
    return pageRows ?? [];
  }, [mode, clientFiltered, loadedPages, pageRows]);

  // -------------------------------------------------------------------------
  // Table 实例（v9 useTable + 显式 features + 控制态注入）
  // -------------------------------------------------------------------------

  const [rowSelection, setRowSelection] = useState<Record<string, true>>({});
  const [expanded, setExpanded] = useState<true | Record<string, boolean>>({});
  const [groupingInternal, setGroupingInternal] = useState<GroupingState>([]);
  const grouping = options.grouping?.columns ?? groupingInternal;
  const groupingRef = useRef(grouping);
  groupingRef.current = grouping;

  const table = useTable(
    {
      features: listTableFeatures,
      data: tableData,
      columns,
      getRowId: (row) => resource.getId(row),
      ...(options.getSubRows ? { getSubRows: options.getSubRows } : {}),
      manualSorting: mode !== "client",
      manualPagination: mode !== "client",
      enableMultiSort: multiSort,
      // 分组列不做自动前移重排：分组行整行横跨渲染（blocks data-table），
      // reorder 模式在受控 state 组合下会反复写 columnOrder（实测死循环）
      groupedColumnMode: false,
      pageCount:
        mode === "server-offset"
          ? Math.max(1, Math.ceil((query.data?.total ?? 0) / state.size))
          : -1,
      rowCount: mode === "server-offset" ? query.data?.total : undefined,
      state: {
        sorting: toSortingState(state.sort),
        pagination: { pageIndex: state.page - 1, pageSize: state.size },
        rowSelection,
        expanded,
        grouping,
      },
      onGroupingChange: (updater) => {
        const next = typeof updater === "function" ? updater(groupingRef.current) : updater;
        if (options.grouping?.onChange) options.grouping.onChange(next);
        else setGroupingInternal(next);
      },
      onSortingChange: (updater) => {
        const next =
          typeof updater === "function" ? updater(toSortingState(stateRef.current.sort)) : updater;
        setSort(fromSortingState(next));
      },
      onPaginationChange: (updater) => {
        const next =
          typeof updater === "function"
            ? updater({ pageIndex: stateRef.current.page - 1, pageSize: stateRef.current.size })
            : updater;
        if (next.pageSize !== stateRef.current.size) setPageSize(next.pageSize);
        else if (next.pageIndex !== stateRef.current.page - 1) setPage(next.pageIndex + 1);
      },
      onRowSelectionChange: setRowSelection,
      onExpandedChange: (updater) => {
        setExpanded(
          typeof updater === "function"
            ? (updater as (prev: true | Record<string, boolean>) => true | Record<string, boolean>)(
                expanded,
              )
            : (updater ?? {}),
        );
      },
    },
    (s) => ({
      sorting: s.sorting,
      pagination: s.pagination,
      rowSelection: s.rowSelection,
      expanded: s.expanded,
      grouping: s.grouping,
      columnSizing: s.columnSizing,
      columnOrder: s.columnOrder,
      columnVisibility: s.columnVisibility,
    }),
  );

  const totalRows: number | undefined = useMemo(() => {
    if (mode === "client") return clientTotal;
    if (mode === "server-offset") return query.data?.total;
    if (mode === "load-more") return loadedPages.flat().length;
    return undefined;
  }, [mode, clientTotal, query.data?.total, loadedPages]);

  const nextPage = useCallback(() => {
    const maxPage =
      totalRows !== undefined
        ? Math.max(1, Math.ceil(totalRows / stateRef.current.size))
        : undefined;
    const target = stateRef.current.page + 1;
    if (maxPage === undefined || target <= maxPage) setPage(target);
  }, [totalRows, setPage]);
  const prevPage = useCallback(() => setPage(Math.max(1, stateRef.current.page - 1)), [setPage]);

  return {
    table: table as unknown as ListTable<TData>,
    query,
    state: {
      search: state.q,
      filters: state.tree,
      sort: state.sort,
      page: state.page,
      pageSize: state.size,
    },
    searchDraft,
    setSearch: setSearchDraft,
    applyFilters,
    setSort,
    setPage,
    setPageSize,
    reset,
    cursorStack,
    nextPage,
    prevPage,
    loadMore,
    totalRows,
    facetData: query.data?.facets,
    clientRows: mode === "client" ? (clientFiltered ?? []) : undefined,
    effectiveFilters,
  };
}

// ---------------------------------------------------------------------------
// useSavedViews（命名视图：localStorage 'fc:view:<resourceKey>'）
// ---------------------------------------------------------------------------

export interface SavedView {
  id: string;
  name: string;
  /** search = 查询串本身（不含 '?'） */
  search: string;
}

export function savedViewsKey(resourceKey: string): string {
  return `fc:view:${resourceKey}`;
}

const savedViewsSchema = z.array(
  z.object({ id: z.string(), name: z.string(), search: z.string() }),
);

/** 命名视图存储（createStorage 单源；旧裸 JSON 数组经 migrate 无损沿用） */
function savedViewsStorage(resourceKey: string) {
  return createStorage(savedViewsKey(resourceKey), savedViewsSchema, {
    version: 1,
    // 信封前格式 = SavedView[] 裸 JSON 数组：直接沿用，字段校验交给 schema（等价旧手写过滤）
    migrate: (raw) => raw,
  });
}

export function readSavedViews(resourceKey: string): SavedView[] {
  return savedViewsStorage(resourceKey).read() ?? [];
}

export function writeSavedViews(resourceKey: string, views: SavedView[]): void {
  savedViewsStorage(resourceKey).write(views);
}

export interface UseSavedViewsResult {
  views: SavedView[];
  /** 以当前 URL 查询段保存（与现有视图查询串相同则去重返回现有项） */
  save(name: string): SavedView;
  /** 导航到该查询段 */
  apply(view: SavedView): void;
  remove(id: string): void;
  update(id: string, name: string): void;
}

export function useSavedViews(resourceKey: string): UseSavedViewsResult {
  const router = useRouterAccess(true);
  const [views, setViews] = useState<SavedView[]>(() => readSavedViews(resourceKey));

  const persist = useCallback(
    (next: SavedView[]) => {
      setViews(next);
      writeSavedViews(resourceKey, next);
    },
    [resourceKey],
  );

  const save = useCallback(
    (name: string): SavedView => {
      const search = router.searchStr.startsWith("?")
        ? router.searchStr.slice(1)
        : router.searchStr;
      const existing = views.find((v) => v.search === search);
      if (existing) return existing;
      const view: SavedView = {
        id:
          typeof globalThis.crypto?.randomUUID === "function"
            ? globalThis.crypto.randomUUID()
            : `v_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        name,
        search,
      };
      persist([...views, view]);
      return view;
    },
    [views, router.searchStr, persist],
  );

  const apply = useCallback(
    (view: SavedView) => {
      const parsed: Record<string, unknown> = {};
      for (const [key, value] of new URLSearchParams(view.search)) {
        parsed[key] = value;
      }
      router.navigateSearch(() => ({ ...parsed, view: view.id }));
    },
    [router],
  );

  const remove = useCallback(
    (id: string) => persist(views.filter((v) => v.id !== id)),
    [views, persist],
  );

  const update = useCallback(
    (id: string, name: string) => persist(views.map((v) => (v.id === id ? { ...v, name } : v))),
    [views, persist],
  );

  return { views, save, apply, remove, update };
}
