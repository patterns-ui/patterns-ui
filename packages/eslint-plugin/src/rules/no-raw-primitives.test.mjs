/** no-raw-primitives 规则单测（RuleTester；裸 table/dialog 原语拦截，M7-B1）。 */

import tseslintParser from "@typescript-eslint/parser";
import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import rule from "./no-raw-primitives.mjs";

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

ruleTester.run("no-raw-primitives", rule, {
  valid: [
    {
      name: "组件引用不拦（词表 block 走注入）",
      code: `const view = <DataTable rows={rows} />;`,
      filename: "registry/blocks/list/list-page/list-page.tsx",
    },
    {
      name: "非原语 HTML 不拦",
      code: `const view = <div className="grid"><section>ok</section></div>;`,
      filename: "registry/blocks/list/list-page/list-page.tsx",
    },
    {
      name: "行尾豁免注释",
      code: `const view = <table className="x" /> /* patterns-ui-allow-raw 封装本体 */;`,
      filename: "registry/blocks/list/list-page/list-page.tsx",
    },
    {
      name: "选项自定义族（默认族外的原语不拦）",
      code: `const view = <table />;`,
      options: [{ tags: ["dialog"] }],
      filename: "registry/blocks/list/list-page/list-page.tsx",
    },
  ],
  invalid: [
    {
      name: "裸 table",
      code: `const view = <table><tbody><tr><td>x</td></tr></tbody></table>;`,
      filename: "registry/blocks/list/list-page/list-page.tsx",
      errors: [
        {
          messageId: "raw",
          data: { tag: "table", replacement: "data-table（横切三态 + 键盘导航 + 列偏好内建）" },
        },
        { messageId: "raw", data: { tag: "tbody", replacement: "data-table" } },
        { messageId: "raw", data: { tag: "tr", replacement: "data-table" } },
        { messageId: "raw", data: { tag: "td", replacement: "data-table" } },
      ],
    },
    {
      name: "裸 dialog",
      code: `const view = <dialog open>原生对话框</dialog>;`,
      filename: "apps/demo/src/pages/settings.page.tsx",
      errors: [
        {
          messageId: "raw",
          data: { tag: "dialog", replacement: "form-dialog / confirm-dialog（焦点回收内建）" },
        },
      ],
    },
    {
      name: "裸 th/colgroup 家族成员逐一拦截",
      code: `const view = <table><colgroup /><th>h</th></table>;`,
      filename: "registry/blocks/list/list-page/list-page.tsx",
      errors: [{ messageId: "raw" }, { messageId: "raw" }, { messageId: "raw" }],
    },
  ],
});
