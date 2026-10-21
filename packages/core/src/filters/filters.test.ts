import { describe, expect, it } from "vitest";
import {
  applyFilterTree,
  canFlatten,
  decodeFiltersFromParams,
  diffFilters,
  encodeFiltersToParams,
  evaluateLeaf,
  type FilterDef,
  type FilterLeaf,
  type FilterTree,
  flattenLeaves,
  removeLeaf,
} from "./index";

const rows = [
  {
    id: "1",
    name: "Payments API",
    status: "running",
    replicas: 3,
    createdAt: "2024-01-05T08:00:00Z",
  },
  {
    id: "2",
    name: "search-indexer",
    status: "stopped",
    replicas: 0,
    createdAt: "2024-03-01T10:30:00Z",
  },
  {
    id: "3",
    name: "Billing Worker",
    status: "degraded",
    replicas: 12,
    createdAt: "2024-06-15T16:45:00Z",
  },
];

describe("evaluateLeaf", () => {
  it("eq / ne", () => {
    const leaf: FilterLeaf = { field: "status", op: "eq", value: "running" };
    expect(evaluateLeaf(rows[0], leaf)).toBe(true);
    expect(evaluateLeaf(rows[1], leaf)).toBe(false);
    expect(evaluateLeaf(rows[1], { field: "status", op: "ne", value: "running" })).toBe(true);
  });

  it("contains 大小写不敏感", () => {
    expect(evaluateLeaf(rows[0], { field: "name", op: "contains", value: "PAYMENTS" })).toBe(true);
    expect(evaluateLeaf(rows[1], { field: "name", op: "contains", value: "API" })).toBe(false);
  });

  it("in / nin", () => {
    const inLeaf: FilterLeaf = { field: "status", op: "in", value: ["running", "degraded"] };
    expect(applyFilterTree(rows, inLeaf).map((r) => r.id)).toEqual(["1", "3"]);
    const nin: FilterLeaf = { field: "status", op: "nin", value: ["running", "degraded"] };
    expect(applyFilterTree(rows, nin).map((r) => r.id)).toEqual(["2"]);
  });

  it("between 数值", () => {
    const leaf: FilterLeaf = { field: "replicas", op: "between", value: [2, 10] };
    expect(applyFilterTree(rows, leaf).map((r) => r.id)).toEqual(["1"]);
  });

  it("between 日期（ISO → 时间戳比较）", () => {
    const leaf: FilterLeaf = {
      field: "createdAt",
      op: "between",
      value: ["2024-02-01", "2024-12-31"],
    };
    expect(applyFilterTree(rows, leaf).map((r) => r.id)).toEqual(["2", "3"]);
  });

  it("gt / lte 数值", () => {
    expect(
      applyFilterTree(rows, { field: "replicas", op: "gt", value: 5 }).map((r) => r.id),
    ).toEqual(["3"]);
    expect(
      applyFilterTree(rows, { field: "replicas", op: "lte", value: 3 }).map((r) => r.id),
    ).toEqual(["1", "2"]);
  });

  it("exists", () => {
    const withOwner = { ...rows[0], owner: "u1" };
    expect(evaluateLeaf(withOwner, { field: "owner", op: "exists", value: true })).toBe(true);
    expect(evaluateLeaf(rows[0], { field: "owner", op: "exists", value: true })).toBe(false);
  });
});

describe("applyFilterTree 组合", () => {
  it("and / or 嵌套", () => {
    const tree: FilterTree = {
      combinator: "or",
      children: [
        { field: "status", op: "eq", value: "stopped" },
        {
          combinator: "and",
          children: [
            { field: "replicas", op: "gte", value: 10 },
            { field: "name", op: "contains", value: "billing" },
          ],
        },
      ],
    };
    expect(applyFilterTree(rows, tree).map((r) => r.id)).toEqual(["2", "3"]);
  });

  it("undefined 树全通过", () => {
    expect(applyFilterTree(rows, undefined).length).toBe(3);
  });
});

const defs: FilterDef[] = [
  { field: "status", label: "状态", kind: "multi-select", options: [] },
  { field: "env", label: "环境", kind: "select", options: [] },
  { field: "replicas", label: "副本", kind: "number" },
  { field: "createdAt", label: "创建", kind: "date-range" },
  { field: "name", label: "名称", kind: "text" },
];

describe("URL 编解码往返", () => {
  it("flat：单叶子 / and 平铺", () => {
    const tree: FilterTree = {
      combinator: "and",
      children: [
        { field: "status", op: "in", value: ["running", "stopped"] },
        { field: "env", op: "eq", value: "prod" },
        { field: "replicas", op: "between", value: [1, 9] },
        { field: "createdAt", op: "between", value: ["2024-01-01", "2024-06-30"] },
      ],
    };
    const params = encodeFiltersToParams(tree, defs);
    expect(params).toEqual({
      status: "running,stopped",
      env: "prod",
      replicas: "1..9",
      createdAt: "2024-01-01..2024-06-30",
    });
    const decoded = decodeFiltersFromParams(params, defs);
    expect(decoded).toEqual(tree);
  });

  it("树模式：or / 嵌套进 f 参数", () => {
    const tree: FilterTree = {
      combinator: "or",
      children: [
        { field: "status", op: "eq", value: "running" },
        { field: "name", op: "contains", value: "billing" },
      ],
    };
    const params = encodeFiltersToParams(tree, defs);
    expect(Object.keys(params)).toEqual(["f"]);
    expect(decodeFiltersFromParams(params, defs)).toEqual(tree);
  });

  it("f 坏值（非 JSON / 不合 schema）静默丢弃", () => {
    expect(decodeFiltersFromParams({ f: "{not json" }, defs)).toBeUndefined();
    expect(decodeFiltersFromParams({ f: JSON.stringify({ bogus: true }) }, defs)).toBeUndefined();
    expect(decodeFiltersFromParams({ f: JSON.stringify("just a string") }, defs)).toBeUndefined();
  });

  it("flat 数值归型（number def → number）", () => {
    const decoded = decodeFiltersFromParams({ replicas: "5" }, defs);
    expect(decoded).toEqual({ field: "replicas", op: "eq", value: 5 });
  });

  it("canFlatten 边界", () => {
    expect(canFlatten({ field: "a", op: "eq", value: 1 })).toBe(true);
    expect(
      canFlatten({
        combinator: "and",
        children: [
          { field: "a", op: "eq", value: 1 },
          { field: "b", op: "eq", value: 2 },
        ],
      }),
    ).toBe(true);
    expect(
      canFlatten({
        combinator: "and",
        children: [
          { field: "a", op: "eq", value: 1 },
          { field: "a", op: "gt", value: 2 },
        ],
      }),
    ).toBe(false);
    expect(
      canFlatten({
        combinator: "or",
        children: [
          { field: "a", op: "eq", value: 1 },
          { field: "b", op: "eq", value: 2 },
        ],
      }),
    ).toBe(false);
  });
});

describe("diffFilters / removeLeaf / flattenLeaves", () => {
  it("diffFilters 忽略 children 顺序", () => {
    const a: FilterTree = {
      combinator: "and",
      children: [
        { field: "a", op: "eq", value: 1 },
        { field: "b", op: "eq", value: 2 },
      ],
    };
    const b: FilterTree = {
      combinator: "and",
      children: [
        { field: "b", op: "eq", value: 2 },
        { field: "a", op: "eq", value: 1 },
      ],
    };
    expect(diffFilters(a, b)).toBe(false);
    expect(
      diffFilters(a, {
        combinator: "and",
        children: [
          { field: "a", op: "eq", value: 1 },
          { field: "b", op: "eq", value: 3 },
        ],
      }),
    ).toBe(true);
    expect(diffFilters(undefined, undefined)).toBe(false);
  });

  it("removeLeaf 移除后塌缩", () => {
    const tree: FilterTree = {
      combinator: "and",
      children: [
        { field: "a", op: "eq", value: 1 },
        { field: "b", op: "eq", value: 2 },
      ],
    };
    expect(removeLeaf(tree, { field: "a", op: "eq", value: 1 })).toEqual({
      field: "b",
      op: "eq",
      value: 2,
    });
    expect(removeLeaf(tree, { field: "a", op: "eq", value: 1 })).not.toEqual(tree);
    expect(flattenLeaves(tree).length).toBe(2);
    expect(
      removeLeaf({ field: "a", op: "eq", value: 1 }, { field: "a", op: "eq", value: 1 }),
    ).toBeUndefined();
  });
});
