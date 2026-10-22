/** no-hex-arbitrary-tailwind 规则单测（RuleTester + 词法工具直测；含 --fix 断言）。 */

import tseslintParser from "@typescript-eslint/parser";
import { RuleTester } from "eslint";
import { describe, expect, it } from "vitest";
import { spacingScaleEquivalent, utilityOfToken } from "../utils/tailwind.mjs";
import rule from "./no-hex-arbitrary-tailwind.mjs";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const ruleTester = new RuleTester({
  languageOptions: {
    parser: tseslintParser,
    ecmaVersion: "latest",
    sourceType: "module",
    parserOptions: { ecmaFeatures: { jsx: true } },
  },
});

describe("tailwind 词法工具", () => {
  it("utilityOfToken 剥除 variant 前缀（方括号感知）", () => {
    expect(utilityOfToken("sm:grid-cols-[1fr_2fr]")).toBe("grid-cols-[1fr_2fr]");
    expect(utilityOfToken("group-hover/row:bg-[color-mix(in_oklab)]")).toBe(
      "bg-[color-mix(in_oklab)]",
    );
    expect(utilityOfToken("md:peer-data-[variant=floating]:m-2")).toBe("m-2");
    expect(utilityOfToken("p-[8px]")).toBe("p-[8px]");
  });

  it("spacing 标度等价：4px 栅格，含 0.5 档；非 spacing 族与奇值无 fix", () => {
    expect(spacingScaleEquivalent("p", "8px")).toBe("p-2");
    expect(spacingScaleEquivalent("gap", "6px")).toBe("gap-1.5");
    expect(spacingScaleEquivalent("w", "2px")).toBe("w-0.5");
    expect(spacingScaleEquivalent("text", "22px")).toBeNull();
    expect(spacingScaleEquivalent("p", "13px")).toBeNull();
    expect(spacingScaleEquivalent("w", "50%")).toBeNull();
  });
});

ruleTester.run("no-hex-arbitrary-tailwind", rule, {
  valid: [
    {
      name: "语义类与标度类不拦",
      code: `export const cls = "text-sm text-danger bg-muted p-2 grid-cols-2";`,
      filename: "registry/blocks/list/list-page/list-page.tsx",
    },
    {
      name: "variant 位方括号不拦（data-/supports-/peer-data-）",
      code: `export const cls = "data-[state=open]:flex supports-[backdrop-filter]:bg-muted/80 md:peer-data-[variant=floating]:m-2 group-data-[state=selected]/row:bg-muted";`,
      filename: "registry/blocks/list/list-page/list-page.tsx",
    },
    {
      name: "白名单（utility 形态与完整 token 形态）",
      code: `export const cls = "text-[13px] sm:grid-cols-[240px_1fr]";`,
      options: [{ allow: ["text-[13px]", "grid-cols-[240px_1fr]"] }],
      filename: "registry/blocks/list/list-page/list-page.tsx",
    },
    {
      name: "行尾豁免注释（该行）",
      code: `export const brand = "#ff0000" /* patterns-ui-allow-color 品牌红，仅此处 */;`,
      filename: "registry/blocks/list/list-page/list-page.tsx",
    },
    {
      name: "非色值 # 词记不拦（锚点/文案）",
      code: `export const anchor = "jump-to-section"; export const title = "C# 与 F#";`,
      filename: "apps/demo/src/pages/overview.page.ts",
    },
    {
      name: "模板字面量插值段不拦（只查静态段）",
      code: "export const cls = `w-[" + "$" + "{String(n)}px] text-sm`;",
      filename: "registry/blocks/list/list-page/list-page.tsx",
    },
  ],
  invalid: [
    {
      name: "hex 色值（字符串内独立词记）",
      code: `export const danger = "#ff0000";`,
      filename: "apps/demo/src/pages/overview.page.ts",
      errors: [{ messageId: "hex", data: { hex: "#ff0000" } }],
    },
    {
      name: "hex 在 className 串内（arbitrary 值内部的 hex 归 arbitrary 管，不双报）",
      code: `export const cls = "text-[10px] bg-[#fafafa]";`,
      filename: "registry/blocks/list/list-page/list-page.tsx",
      errors: [{ messageId: "arbitrary" }, { messageId: "arbitrary" }],
    },
    {
      name: "arbitrary 尺寸（无 fix——非 4px 栅格）",
      code: `export const cls = "text-[22px]";`,
      filename: "registry/blocks/list/list-page/list-page.tsx",
      errors: [{ messageId: "arbitrary", data: { utility: "text-[22px]" } }],
    },
    {
      name: "spacing 族 px 有 --fix：p-[8px] → p-2",
      code: `export const cls = "p-[8px] w-[17px]";`,
      filename: "registry/blocks/list/list-page/list-page.tsx",
      errors: [{ messageId: "arbitrary" }, { messageId: "arbitrary" }],
      output: `export const cls = "p-2 w-[17px]";`,
    },
    {
      name: "--fix 含 variant 前缀与 0.5 档（gap-[6px] → gap-1.5）",
      code: `export const cls = "md:gap-[6px]";`,
      filename: "registry/blocks/list/list-page/list-page.tsx",
      errors: [{ messageId: "arbitrary", data: { utility: "gap-[6px]" } }],
      output: `export const cls = "md:gap-1.5";`,
    },
    {
      name: "同一 token 出现两次 → 两处各自 fix",
      code: `export const cls = "p-[8px] p-[8px]";`,
      filename: "registry/blocks/list/list-page/list-page.tsx",
      errors: [{ messageId: "arbitrary" }, { messageId: "arbitrary" }],
      output: `export const cls = "p-2 p-2";`,
    },
    {
      name: "JSX attribute 字符串同样拦截",
      code: `export const view = <div className="p-[8px]" />;`,
      filename: "registry/blocks/list/list-page/list-page.tsx",
      errors: [{ messageId: "arbitrary", data: { utility: "p-[8px]" } }],
      output: `export const view = <div className="p-2" />;`,
    },
  ],
});
