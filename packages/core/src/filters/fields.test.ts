import { describe, expect, it } from "vitest";
import {
  filterLabel,
  inValuesForField,
  leafForField,
  leavesForField,
  opsForFilterDef,
  removeField,
  valueControlForDef,
  withFieldLeaf,
} from "./fields";
import type { FilterDef, FilterTree } from "./index";

const statusIn: FilterTree = {
  field: "status",
  op: "in",
  value: ["running", "degraded"],
};
const envLeaf: FilterTree = { field: "env", op: "eq", value: "prod" };
const nameLeaf: FilterTree = { field: "name", op: "contains", value: "gateway" };

describe("字段级遍历", () => {
  it("leavesForField 深度优先收集同字段叶子", () => {
    const tree: FilterTree = {
      combinator: "and",
      children: [
        envLeaf,
        { combinator: "or", children: [statusIn, nameLeaf] },
        { field: "status", op: "eq", value: "stopped" },
      ],
    };
    expect(leavesForField(tree, "status")).toHaveLength(2);
    expect(leavesForField(tree, "nope")).toEqual([]);
    expect(leavesForField(undefined, "status")).toEqual([]);
  });

  it("leafForField 取首个叶子（单叶子树直接命中）", () => {
    expect(leafForField(envLeaf, "env")).toBe(envLeaf);
    expect(leafForField(envLeaf, "status")).toBeUndefined();
  });

  it("inValuesForField 读 in 叶子值集合（非 in / 非数组回空）", () => {
    expect(inValuesForField(statusIn, "status")).toEqual(["running", "degraded"]);
    expect(inValuesForField({ field: "status", op: "eq", value: "running" }, "status")).toEqual([]);
    expect(inValuesForField(undefined, "status")).toEqual([]);
  });
});

describe("字段级写入", () => {
  it("withFieldLeaf：空树 → 叶子；同字段叶子替换", () => {
    expect(withFieldLeaf(undefined, envLeaf)).toBe(envLeaf);
    expect(withFieldLeaf(envLeaf, { field: "env", op: "eq", value: "staging" })).toEqual({
      field: "env",
      op: "eq",
      value: "staging",
    });
  });

  it("withFieldLeaf：异字段叶子 → and 组合", () => {
    expect(withFieldLeaf(envLeaf, nameLeaf)).toEqual({
      combinator: "and",
      children: [envLeaf, nameLeaf],
    });
  });

  it("withFieldLeaf：or 根保持 combinator，同字段的直接叶子原位替换", () => {
    const tree: FilterTree = { combinator: "or", children: [statusIn, nameLeaf] };
    const next = withFieldLeaf(tree, { field: "status", op: "in", value: ["stopped"] });
    expect(next).toEqual({
      combinator: "or",
      children: [{ field: "status", op: "in", value: ["stopped"] }, nameLeaf],
    });
  });

  it("withFieldLeaf：嵌套在条件组内的同字段叶子原位替换（不产生重复叶子）", () => {
    const tree: FilterTree = {
      combinator: "and",
      children: [envLeaf, { combinator: "or", children: [statusIn, nameLeaf] }],
    };
    const next = withFieldLeaf(tree, { field: "status", op: "in", value: ["stopped"] });
    expect(next).toEqual({
      combinator: "and",
      children: [
        envLeaf,
        {
          combinator: "or",
          children: [{ field: "status", op: "in", value: ["stopped"] }, nameLeaf],
        },
      ],
    });
  });

  it("withFieldLeaf：字段首次出现追加到根（保持根 combinator）", () => {
    const tree: FilterTree = { combinator: "and", children: [envLeaf, nameLeaf] };
    expect(withFieldLeaf(tree, statusIn)).toEqual({
      combinator: "and",
      children: [envLeaf, nameLeaf, statusIn],
    });
  });

  it("removeField：递归移除并塌缩空/单孩子节点", () => {
    const tree: FilterTree = {
      combinator: "and",
      children: [envLeaf, { combinator: "or", children: [statusIn, nameLeaf] }],
    };
    expect(removeField(tree, "status")).toEqual({
      combinator: "and",
      children: [envLeaf, nameLeaf],
    });
    // env 移除后 and 只剩单孩子 or 组 → 塌缩为该组本身
    expect(removeField(tree, "env")).toEqual({
      combinator: "or",
      children: [statusIn, nameLeaf],
    });
    expect(removeField(nameLeaf, "name")).toBeUndefined();
    expect(removeField(undefined, "x")).toBeUndefined();
  });
});

describe("控件类型与运算符推断", () => {
  const defs: FilterDef[] = [
    { field: "env", label: "环境", kind: "select", options: [] },
    { field: "status", label: "状态", kind: "multi-select", options: [] },
    { field: "createdAt", label: "创建时间", kind: "date-range" },
    { field: "replicas", label: "副本数", kind: "number" },
    { field: "name", label: "名称", kind: "text" },
  ];
  const byField = (field: string) => defs.find((d) => d.field === field);

  it("valueControlForDef：kind × op → 控件形态", () => {
    expect(valueControlForDef(byField("env"), "eq")).toBe("option");
    expect(valueControlForDef(byField("status"), "in")).toBe("options");
    expect(valueControlForDef(byField("createdAt"), "between")).toBe("range");
    expect(valueControlForDef(byField("replicas"), "between")).toBe("range");
    expect(valueControlForDef(byField("replicas"), "gte")).toBe("number");
    expect(valueControlForDef(byField("name"), "contains")).toBe("text");
    expect(valueControlForDef(undefined, "eq")).toBe("text");
  });

  it("opsForFilterDef：kind → 可选运算符封闭词表", () => {
    expect(opsForFilterDef(byField("replicas"))).toEqual([
      "eq",
      "gt",
      "gte",
      "lt",
      "lte",
      "between",
    ]);
    expect(opsForFilterDef(byField("status"))).toEqual(["in", "nin"]);
    expect(opsForFilterDef(byField("createdAt"))).toEqual(["between"]);
    expect(opsForFilterDef(byField("name"))).toEqual(["eq", "ne", "contains"]);
    expect(opsForFilterDef(undefined)).toEqual(["eq", "ne", "contains"]);
  });

  it("filterLabel：defs 声明优先，缺省回字段名", () => {
    expect(filterLabel(defs, "env")).toBe("环境");
    expect(filterLabel(defs, "nope")).toBe("nope");
  });
});
