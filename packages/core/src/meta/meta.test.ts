/**
 * meta 公共机制单测（M7-C2）：defineMetaPattern 校验路径 + validateMetaPatternAdapter 的
 * 形状不符警告 / contractVersion 失配警告 / 生产零开销。
 */

import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineMetaPattern, validateMetaPatternAdapter } from "./index";

const shape = z.object({ list: z.function(), update: z.function().optional() }).loose();
const pattern = defineMetaPattern("read-state", 1, shape);

describe("defineMetaPattern", () => {
  it("封闭词表外的名字 → throw 列全表（报错即目录）", () => {
    expect(() =>
      defineMetaPattern("read" as Parameters<typeof defineMetaPattern>[0], 1, shape),
    ).toThrow(/合法值：\[resource-lifecycle/);
  });

  it("contractVersion 非正整数 → throw", () => {
    expect(() => defineMetaPattern("read-state", 0, shape)).toThrow(/正整数/);
    expect(() => defineMetaPattern("read-state", 1.5, shape)).toThrow(/正整数/);
  });
});

describe("validateMetaPatternAdapter", () => {
  it("形状相符 → 无警告", () => {
    const warn = vi.fn();
    validateMetaPatternAdapter(pattern, { list() {} }, { warn });
    expect(warn).not.toHaveBeenCalled();
  });

  it("形状不符 → 警告带 issue 与期望 contractVersion", () => {
    const warn = vi.fn();
    validateMetaPatternAdapter(pattern, { nope: true }, { consumer: "useReadState", warn });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("read-state");
    expect(warn.mock.calls[0]?.[0]).toContain("v1");
    expect(warn.mock.calls[0]?.[0]).toContain("list");
  });

  it("contractVersion 失配 → 警告携带两侧版本", () => {
    const warn = vi.fn();
    validateMetaPatternAdapter(
      pattern,
      { list() {}, contractVersion: 2 },
      { consumer: "useReadState", warn },
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("2 ≠ 引擎契约 v1");
  });

  it("不携带 contractVersion → 只做形状校验（无版本警告）", () => {
    const warn = vi.fn();
    validateMetaPatternAdapter(pattern, { list() {} }, { warn });
    expect(warn).not.toHaveBeenCalled();
  });

  it("生产零开销：NODE_ENV=production 直接返回（形状/版本均不校验、不解析）", () => {
    const warn = vi.fn();
    validateMetaPatternAdapter(
      pattern,
      { totally: "wrong", contractVersion: 99 },
      { env: { NODE_ENV: "production" }, warn },
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("适配器为 null/undefined → 形状警告（不抛错）", () => {
    const warn = vi.fn();
    validateMetaPatternAdapter(pattern, null, { warn });
    validateMetaPatternAdapter(pattern, undefined, { warn });
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
