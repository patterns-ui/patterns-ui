// @vitest-environment happy-dom
/**
 * 负页码 / 非法 pageSize 回归单测（docs/paradigm.md §5-B 任务8）：
 * `?page=-1`、`?size=-30` 等 URL 坏值经 createListSearchSchema 的 .catch() 回落
 * 合法值（undefined → 页码回落 1、size 回落默认档），不中断导航、不产生越界请求。
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createResource, type ListParams, type ResourceClient } from "../data";
import {
  createListColumnHelper,
  createListSearchSchema,
  DEFAULT_PAGE_SIZE,
  useResourceTable,
} from "./index";

interface Row {
  id: string;
  name: string;
}

describe("createListSearchSchema：负值/坏值回落", () => {
  it("?page=-1 → undefined（页码回落 1）；?size=-30 → undefined（回落默认档）", () => {
    const schema = createListSearchSchema({});
    const parsed = schema.parse({ page: "-1", size: "-30" });
    expect(parsed.page).toBeUndefined();
    expect(parsed.size).toBeUndefined();
  });

  it("数字形态的负值同样回落（schema 直灌场景）", () => {
    const schema = createListSearchSchema({});
    const parsed = schema.parse({ page: -1, size: -30 });
    expect(parsed.page).toBeUndefined();
    expect(parsed.size).toBeUndefined();
  });

  it("非数字垃圾值回落（NaN / 字母 / 空串）", () => {
    const schema = createListSearchSchema({});
    for (const bad of ["abc", "", "1.5x", "999999999999999999999999"]) {
      const parsed = schema.parse({ page: bad, size: bad });
      expect(parsed.page, `page=${bad}`).toBeUndefined();
      expect(parsed.size, `size=${bad}`).toBeUndefined();
    }
  });

  it("合法值正常通过（边界：page=1 与档位内 size）", () => {
    const schema = createListSearchSchema({});
    expect(schema.parse({ page: "1", size: "20" })).toMatchObject({ page: 1, size: 20 });
    expect(schema.parse({ page: "3", size: "50" })).toMatchObject({ page: 3, size: 50 });
  });

  it("合法页码的紧邻坏值（0 / -0）也回落 undefined", () => {
    const schema = createListSearchSchema({});
    expect(schema.parse({ page: "0" }).page).toBeUndefined();
    expect(schema.parse({ page: "-0" }).page).toBeUndefined();
  });
});

describe("useResourceTable：URL 坏 size 经 schema 回落后走缺省档（内存模式等价验证）", () => {
  it("初始 pageSize 未声明 → DEFAULT_PAGE_SIZE 生效，请求携带合法 size", async () => {
    const requested: ListParams[] = [];
    const client: ResourceClient<Row, Partial<Row>, Partial<Row>> = {
      list: async (params) => {
        requested.push(params);
        return { rows: [{ id: "a", name: "A" }], total: 1 };
      },
      get: async (id) => ({ id, name: "A" }),
    };
    const resource = createResource<Row, Partial<Row>, Partial<Row>>({
      name: "neg-page",
      client,
      tenantScoped: false,
    });
    const helper = createListColumnHelper<Row>();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(
      () =>
        useResourceTable<Row>({
          resource,
          mode: "server-offset",
          columns: [helper.accessor("name", { id: "name" })],
          syncWithLocation: false,
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.query.data).toBeDefined());
    // URL `?size=-30` 经 schema .catch → undefined → 表格回落缺省档
    expect(result.current.state.pageSize).toBe(DEFAULT_PAGE_SIZE);
    expect(result.current.state.page).toBe(1);
    expect(requested[0]?.pageSize).toBe(DEFAULT_PAGE_SIZE);
  });
});
