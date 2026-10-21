import { describe, expect, it } from "vitest";

// M0 冒烟：保证 vitest 管道就位，防止空跑失败。各模块单测自 M2 起补充。
describe("core skeleton", () => {
  it("vitest pipeline works", () => {
    expect(1).toBe(1);
  });
});
