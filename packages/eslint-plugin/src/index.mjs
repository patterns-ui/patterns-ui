/**
 * patterns-ui/eslint-plugin —— 插件入口（M7-B1，docs/paradigm.md §6）。
 *
 * flat config preset（configs.recommended）：
 * - pages 配置域（glob「pages 目录下任意文件」，按 *.page.ts / tables.ts 约定）：0 JSX + 禁裸原语 + 禁色值/arbitrary；
 * - registry blocks 域（glob「registry/blocks 下任意文件」）：禁裸原语 + 禁色值/arbitrary + meta 冻结。
 *
 * 规则本体不依赖仓内路径（paradigm §6 M7-D：服务未来 npm 发布）——
 * 仓库特有决策（blocksRoot/manifest 路径、白名单基线、封装本体豁免）一律由
 * 消费方的 eslint.config 提供（本仓为仓根 eslint.config.mjs）。
 */

import tseslintParser from "@typescript-eslint/parser";
import noHexArbitraryTailwind from "./rules/no-hex-arbitrary-tailwind.mjs";
import noJsxInPages from "./rules/no-jsx-in-pages.mjs";
import noRawPrimitives from "./rules/no-raw-primitives.mjs";
import registryFrozen from "./rules/registry-frozen.mjs";

// 注：刻意不做整体 @type 注解——flat config 的 rules/languageOptions 深层泛型在 JS 里
// 推断优于强注解（规则本体各自有 RuleModule 类型约束，见 rules/*.mjs）。
const plugin = {
  meta: { name: "@patterns-ui/eslint-plugin", version: "0.1.0" },
  rules: {
    "no-jsx-in-pages": noJsxInPages,
    "no-raw-primitives": noRawPrimitives,
    "no-hex-arbitrary-tailwind": noHexArbitraryTailwind,
    "registry-frozen": registryFrozen,
  },
  /** @type {Record<string, unknown>} */
  configs: {},
};

/** pages / registry 两域共用的 TS+JSX 语言选项（pages 是 .ts 纯配置也开 jsx：让 JSX 可解析后被规则拦截，而非解析报错） */
const languageOptions = {
  parser: tseslintParser,
  ecmaVersion: "latest",
  sourceType: "module",
  parserOptions: { ecmaFeatures: { jsx: true } },
};

plugin.configs.recommended = [
  {
    name: "patterns-ui/pages",
    files: ["**/pages/**/*.{js,jsx,mjs,cjs,ts,tsx}"],
    plugins: { "patterns-ui": plugin },
    languageOptions,
    rules: {
      "patterns-ui/no-jsx-in-pages": "error",
      "patterns-ui/no-raw-primitives": "error",
      "patterns-ui/no-hex-arbitrary-tailwind": "error",
    },
  },
  {
    name: "patterns-ui/registry",
    files: ["registry/blocks/**/*.{js,jsx,mjs,cjs,ts,tsx}"],
    plugins: { "patterns-ui": plugin },
    languageOptions,
    rules: {
      "patterns-ui/no-raw-primitives": "error",
      "patterns-ui/no-hex-arbitrary-tailwind": "error",
      "patterns-ui/registry-frozen": [
        "error",
        { manifest: "registry/.freeze.json", blocksRoot: "registry/blocks" },
      ],
    },
  },
];

export default plugin;
