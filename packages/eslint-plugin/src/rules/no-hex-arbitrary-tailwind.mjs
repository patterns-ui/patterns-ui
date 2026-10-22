/**
 * no-hex-arbitrary-tailwind —— 禁 hex 色值与 arbitrary tailwind 值（pages/registry 域）。
 *
 * 色值必须走主题令牌（--status-* 等）与语义类；尺寸/间距走设计标度。
 * variant 位的方括号（data-[state=open]:、supports-[backdrop-filter]:）不违规。
 * --fix：仅 spacing 族 px（`p-[8px]` → `p-2`，tailwind v4 默认 4px 栅格的确定性等价）；
 * hex 与其它 arbitrary 值不提供 fix（无确定性等价，须人改令牌/标度）。
 * 例外：选项 allow 白名单（repo 基线在仓根 eslint.config.mjs，逐值给理由）或行尾注释
 * `/* patterns-ui-allow-color *\/`。
 */

import { colorAllowMarker, hasLineAllowComment } from "../utils/exemptions.mjs";
import {
  findArbitraryTokens,
  findHexTokens,
  parseArbitraryUtility,
  spacingScaleEquivalent,
} from "../utils/tailwind.mjs";

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: { description: "禁 hex 色值与 arbitrary tailwind 值（-[…] utility）——走令牌/设计标度" },
    fixable: "code",
    schema: [
      {
        type: "object",
        properties: {
          allow: { type: "array", items: { type: "string" }, uniqueItems: true },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      hex: "禁 hex 色值 {{hex}}：改用主题令牌（--status-* / --color-*）或语义类（text-danger、bg-muted…）；确需例外加行尾注释 /* patterns-ui-allow-color */ 或登记 allow 白名单。",
      arbitrary:
        "禁 arbitrary tailwind 值 {{utility}}：改用设计标度类或语义令牌；确需例外加行尾注释 /* patterns-ui-allow-color */ 或登记 allow 白名单。",
    },
  },
  /** @param {import("eslint").Rule.RuleContext} context */
  create(context) {
    const allow = context.options[0]?.allow ?? [];
    const sourceCode = context.sourceCode;

    return {
      /** @param {import("estree").Literal} node */
      Literal(node) {
        if (typeof node.value !== "string") return;
        if (hasLineAllowComment(sourceCode, node, colorAllowMarker())) return;
        checkString(node, node.value);
      },
      /** @param {import("estree").TemplateLiteral} node */
      TemplateLiteral(node) {
        if (hasLineAllowComment(sourceCode, node, colorAllowMarker())) return;
        for (const quasi of node.quasis) {
          const cooked = quasi.value.cooked ?? "";
          if (cooked !== "") checkString(node, cooked);
        }
      },
    };

    /**
     * 检查一段 cooked 字符串；fix 在 node 的源码文本内定位该次出现的 token。
     * @param {import("estree").Node} node 持有该字符串的节点（Literal / TemplateLiteral）
     * @param {string} value cooked 值
     */
    function checkString(node, value) {
      for (const { hex } of findHexTokens(value, allow)) {
        context.report({ node, messageId: "hex", data: { hex } });
      }
      for (const { token, utility, offset } of findArbitraryTokens(value, allow)) {
        const parsed = parseArbitraryUtility(utility);
        const replacement = parsed ? spacingScaleEquivalent(parsed.base, parsed.value) : null;
        // 保留 variant 前缀（`md:gap-[6px]` → `md:gap-1.5`）：只替换 token 的 utility 段
        const replacementToken =
          replacement === null ? null : token.slice(0, token.length - utility.length) + replacement;
        const occurrence = countPriorOccurrences(value, token, offset);
        context.report({
          node,
          messageId: "arbitrary",
          data: { utility },
          fix: (fixer) => {
            const range = node.range;
            if (replacementToken === null || range === undefined) return null;
            const text = sourceCode.getText(node);
            const rel = nthIndexOf(text, token, occurrence);
            if (rel === -1) return null;
            const abs = range[0] + rel;
            return fixer.replaceTextRange([abs, abs + token.length], replacementToken);
          },
        });
      }
    }
  },
};

export default rule;
/**
 * @param {string} value
 * @param {string} token
 * @param {number} offset 本次出现的位置
 * @returns {number} value 中 offset 之前 token 出现的次数（本次为第 0 起）
 */
function countPriorOccurrences(value, token, offset) {
  let count = 0;
  let i = value.indexOf(token);
  while (i !== -1 && i < offset) {
    count += 1;
    i = value.indexOf(token, i + token.length);
  }
  return count;
}

/**
 * @param {string} text 节点源码文本（getText，相对节点起始）
 * @param {string} token
 * @param {number} occurrence 第几次出现（0 起）
 * @returns {number} 相对节点起始的偏移；未找到 → -1
 */
function nthIndexOf(text, token, occurrence) {
  let i = text.indexOf(token);
  let seen = 0;
  while (i !== -1) {
    if (seen === occurrence) return i;
    seen += 1;
    i = text.indexOf(token, i + token.length);
  }
  return -1;
}
