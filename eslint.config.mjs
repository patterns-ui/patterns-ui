/**
 * M7-B1：@patterns-ui/eslint-plugin 仓内挂载（docs/paradigm.md §6 B1 工具链决策）。
 *
 * 作用域：仅 apps/demo/src/pages/**（配置纯度域）与 registry/blocks/**（词表源域）受
 * eslint 管——preset 内部已按 files 收窄；其余目录不进任何 eslint 配置项，biome 保持
 * 全仓其余职责（自定义规则 biome 不支持，故 eslint 只承载范式规则）。
 *
 * 运行（主会话接 root script `lint:eslint` 与 CI 用）：
 *   pnpm --filter @patterns-ui/eslint-plugin lint:eslint
 *   （等价展开：pnpm --filter @patterns-ui/eslint-plugin exec eslint ../../apps/demo/src/pages ../../registry/blocks）
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import patternsUI from "./packages/eslint-plugin/src/index.mjs";

/** 配置文件所在目录（= 仓根；绝对路径不受 eslint 调用 cwd 影响——registry-frozen 的 manifest/blocksRoot 需要绝对定位） */
const ROOT = path.dirname(fileURLToPath(import.meta.url));

/**
 * 色值/arbitrary 基线白名单（规则 allow 选项；utility 形态，variant 前缀无关）。
 * 白名单机制 = 确需例外的登记位：新增值须在此登记并给理由（PR 可见）。
 */
const TAILWIND_BASELINE = [
  // 微标签/辅助字号档（blocks 排版决策：12/13px 微标签、30px 大数、64px 错误页大码、22px 页标题=1.375rem）
  "text-[10px]",
  "text-[11px]",
  "text-[13px]",
  "text-[15px]",
  "text-[30px]",
  "text-[64px]",
  "text-[1.375rem]",
  // 骨架占位百分比与行高（skeleton：表头/行严格占位，architecture §8）
  "w-[12%]",
  "w-[14%]",
  "w-[24%]",
  "h-[30px]",
  "rounded-[4px]",
  // 布局网格（timeline 24px 节列、diff-viewer 对比网格、settings 双栏）
  "grid-cols-[24px_1fr]",
  "grid-cols-[auto_1fr]",
  "grid-cols-[110px_minmax(0,1fr)]",
  "grid-cols-[110px_minmax(0,2fr)_minmax(0,2fr)]",
  "grid-cols-[240px_1fr]",
  // 滚动容器上限与粘性表头背景（data-table）
  "max-w-[10rem]",
  "max-h-[70vh]",
  "transition-[width]",
  "bg-[color-mix(in_oklab,var(--muted)_50%,var(--background))]",
];

export default [
  ...patternsUI.configs.recommended,

  {
    // registry-frozen 的路径选项用绝对路径（规则本身 path-agnostic；此处锚定本仓布局）
    name: "patterns-ui/repo-overrides/registry-frozen-paths",
    files: ["registry/blocks/**/*.{js,jsx,mjs,cjs,ts,tsx}"],
    rules: {
      "patterns-ui/registry-frozen": [
        "error",
        {
          manifest: path.join(ROOT, "registry", ".freeze.json"),
          blocksRoot: path.join(ROOT, "registry", "blocks"),
        },
      ],
    },
  },
  {
    // data-table 是 table 家族封装本体（裸 <table> 的唯一合法居所：三态/键盘导航/列偏好内建于此）
    name: "patterns-ui/repo-overrides/table-family-wrapper",
    files: ["registry/blocks/list/data-table/**"],
    rules: {
      "patterns-ui/no-raw-primitives": "off",
    },
  },
  {
    // 色值/arbitrary 白名单基线（见上 TAILWIND_BASELINE 注释；hex 当前零基线——保持为零）
    name: "patterns-ui/repo-overrides/tailwind-baseline",
    files: ["apps/demo/src/pages/**", "registry/blocks/**"],
    rules: {
      "patterns-ui/no-hex-arbitrary-tailwind": ["error", { allow: TAILWIND_BASELINE }],
    },
  },
];
