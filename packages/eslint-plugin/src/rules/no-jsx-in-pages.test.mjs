/** no-jsx-in-pages 规则单测（RuleTester；pages 0-JSX 纯配置，paradigm §3.3）。 */

import tseslintParser from "@typescript-eslint/parser";
import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import rule from "./no-jsx-in-pages.mjs";

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

ruleTester.run("no-jsx-in-pages", rule, {
  valid: [
    {
      name: "纯配置（类型化适配器引用，无 JSX）",
      code: `import { definePage } from "@patterns-ui/core/page";
import { tables } from "./tables";
export const page = definePage("auth-flow", { host: "sign-in-page" });`,
      filename: "apps/demo/src/pages/sign-in.page.ts",
    },
    {
      name: "表格/网格名等字符串不误报",
      code: `export const note = "表格与 <tr> 仅是文案";`,
      filename: "apps/demo/src/pages/audit.page.ts",
    },
    {
      name: "文件头 // sandbox: 登记注释 = 逃生位",
      code: `// sandbox: one-off 试验页（查重后晋升，paradigm §3.5）
export const badge = <em>试验</em>;`,
      filename: "apps/demo/src/pages/sandbox.page.tsx",
    },
  ],
  invalid: [
    {
      name: "JSX 元素（pages 域内的 .tsx——.ts 文件的 JSX 会先成 parsing error，同样拦截）",
      code: `export const cell = <span>手写</span>;`,
      filename: "apps/demo/src/pages/audit.page.tsx",
      errors: [{ messageId: "element" }],
    },
    {
      name: "JSX Fragment",
      code: `export const pair = <>1</>;`,
      filename: "apps/demo/src/pages/audit.page.tsx",
      errors: [{ messageId: "fragment" }],
    },
    {
      name: "sandbox 登记须在文件头（首语句之后不算）",
      code: `export const a = 1;
// sandbox: 迟到的登记
export const cell = <span>手写</span>;`,
      filename: "apps/demo/src/pages/audit.page.tsx",
      errors: [{ messageId: "element" }],
    },
  ],
});
