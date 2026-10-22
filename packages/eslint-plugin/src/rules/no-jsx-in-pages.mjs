/**
 * no-jsx-in-pages —— pages 配置域禁 JSX（paradigm §3.3「0 JSX 配置」）。
 *
 * 页面是纯配置（definePage/defineResource/视图工厂 spec + 类型化适配器引用）；
 * JSX 出现 = 组装逻辑回流页面。豁免通道：文件头 `// sandbox:` 登记注释
 * （sandbox 棘轮登记制，§3.5）。路由文件（src/routes/**）不在本规则域。
 */

import { hasSandboxHeader } from "../utils/exemptions.mjs";

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "pages 配置域禁 JSX（0 JSX 配置；JSX 应下沉为视图工厂参数/宿主 block）",
      url: "https://github.com/patterns-ui/patterns-ui/blob/main/docs/paradigm.md",
    },
    schema: [],
    messages: {
      element:
        "pages 配置域禁 JSX 元素（paradigm §3.3 0 JSX 配置）：把组装下沉为 definePage/defineResource 配置、视图工厂参数或宿主 block；确需沙箱试验请在文件头登记 `// sandbox: <名>`。",
      fragment:
        "pages 配置域禁 JSX Fragment（paradigm §3.3 0 JSX 配置）：同上——组装下沉配置/工厂；沙箱试验须文件头 `// sandbox:` 登记。",
    },
  },
  /** @param {import("eslint").Rule.RuleContext} context */
  create(context) {
    const sourceCode = context.sourceCode;
    /** @type {boolean | undefined} */
    let sandboxExempt;
    return {
      /** @param {import("estree").Program} program */
      Program(program) {
        sandboxExempt = hasSandboxHeader(sourceCode, program);
      },
      /** @param {any} node */
      JSXElement(node) {
        if (!sandboxExempt) context.report({ node, messageId: "element" });
      },
      /** @param {any} node */
      JSXFragment(node) {
        if (!sandboxExempt) context.report({ node, messageId: "fragment" });
      },
    };
  },
};

export default rule;
