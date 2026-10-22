/**
 * no-raw-primitives —— pages/registry 域禁裸 table 家族与 dialog 原语。
 *
 * 理由（paradigm §6 B1）：横切三态（loading/empty/error）与 a11y（键盘导航、焦点回收）
 * 内建在 data-table / dialog 系 block 里，裸原语 = 绕过共享内核的一致性来源。
 * 封装本体（如 data-table 自身渲染 `<table>`）由消费方 config 对该目录关规则，不走逐行豁免。
 * 逐处例外：行尾注释 `/* patterns-ui-allow-raw *\/`。
 */

import { hasLineAllowComment, rawAllowMarker } from "../utils/exemptions.mjs";

/** 裸原语族：table 全家 + dialog（原生 <dialog> 焦点/可访问性语义裸用即债） */
const DEFAULT_TAGS = [
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "td",
  "th",
  "caption",
  "colgroup",
  "col",
  "dialog",
];

/** 每个原语的替代 block（报错即目录） @type {Record<string, string>} */
const REPLACEMENTS = {
  table: "data-table（横切三态 + 键盘导航 + 列偏好内建）",
  thead: "data-table",
  tbody: "data-table",
  tfoot: "data-table",
  tr: "data-table",
  td: "data-table",
  th: "data-table",
  caption: "data-table",
  colgroup: "data-table",
  col: "data-table",
  dialog: "form-dialog / confirm-dialog（焦点回收内建）",
};

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: {
      description: "禁裸 <table> 家族与 <dialog> 原语——必须走 data-table / dialog 系 block",
    },
    schema: [
      {
        type: "object",
        properties: {
          tags: { type: "array", items: { type: "string" }, uniqueItems: true },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      raw: "禁裸 <{{tag}}> 原语：改走 {{replacement}}；确需例外加行尾注释 /* patterns-ui-allow-raw */。",
    },
  },
  /** @param {import("eslint").Rule.RuleContext} context */
  create(context) {
    const tags = new Set(context.options[0]?.tags ?? DEFAULT_TAGS);
    const sourceCode = context.sourceCode;
    return {
      /** @param {any} node JSXOpeningElement */
      JSXOpeningElement(node) {
        if (node.name.type !== "JSXIdentifier") return;
        const tag = node.name.name;
        if (!tags.has(tag)) return;
        if (hasLineAllowComment(sourceCode, node, rawAllowMarker())) return;
        context.report({
          node: node.name,
          messageId: "raw",
          data: { tag, replacement: REPLACEMENTS[tag] ?? "对应 block" },
        });
      },
    };
  },
};

export default rule;
