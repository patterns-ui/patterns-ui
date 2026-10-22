/**
 * tailwind 词法工具：no-hex-arbitrary-tailwind 的单源实现（供规则与测试消费）。
 *
 * 两类违规：
 * - hex 色值：字符串中的独立 `#rgb/#rgba/#rrggbb/#rrggbbaa` 词记（arbitrary 值内部的
 *   `bg-[#fff]` 归 arbitrary 管，不重复报）；
 * - arbitrary tailwind 值：utility 位（variant 前缀剥除后）形如 `text-[22px]`、`w-[17px]`、
 *   `bg-[color-mix(...)]` 的 `名-[值]`。variant 位的方括号（`data-[state=open]:flex`、
 *   `md:peer-data-[variant=floating]:m-2`、`supports-[backdrop-filter]:…`）不是违规。
 *
 * --fix：仅 spacing 族 px 值有确定性等价（4px 栅格 → 标度名，如 `p-[8px]` → `p-2`）；
 * 其余（hex、非整栅格 px、rem/%/函数值）不可安全自动改 → 不提供 fix，靠白名单/豁免注释/语义令牌。
 */

/** arbitrary 值 utility 的形状：`名-[值]`（值为非空、不含 `]`） */
const ARBITRARY_UTILITY_RE = /^([a-z][a-z0-9]*(?:-[a-z0-9]+)*)-\[([^[\]]+)\]$/;

/** hex 色值：独立词记（前后为空白/引号/括号边界），3/4/6/8 位 */
const HEX_TOKEN_RE =
  /(^|[\s"'`(])#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})(?=$|[\s"'`),;])/u;

/** tailwind v4 默认 spacing 标度适用的 utility 前缀（`--spacing` 4px 栅格；`p-[8px]`→`p-2`） */
const SPACING_PREFIXES = new Set([
  "m",
  "mx",
  "my",
  "ms",
  "me",
  "mt",
  "mr",
  "mb",
  "ml",
  "p",
  "px",
  "py",
  "ps",
  "pe",
  "pt",
  "pr",
  "pb",
  "pl",
  "gap",
  "gap-x",
  "gap-y",
  "w",
  "h",
  "size",
  "min-w",
  "max-w",
  "min-h",
  "max-h",
  "top",
  "right",
  "bottom",
  "left",
  "inset",
  "inset-x",
  "inset-y",
  "start",
  "end",
  "space-x",
  "space-y",
  "translate-x",
  "translate-y",
  "basis",
]);

/**
 * 剥除 variant 前缀：取 token 中最后一个「顶层」（方括号外）`:` 之后的 utility 段。
 * 例：`sm:grid-cols-[1fr_2fr]` → `grid-cols-[1fr_2fr]`；`group-hover/row:bg-[…]` → `bg-[…]`。
 * @param {string} token className 词记（无空白）
 * @returns {string} utility 段
 */
export function utilityOfToken(token) {
  let depth = 0;
  let cut = -1;
  for (let i = 0; i < token.length; i++) {
    const ch = token[i];
    if (ch === "[" || ch === "(") depth += 1;
    else if (ch === "]" || ch === ")") depth -= 1;
    else if (ch === ":" && depth === 0) cut = i;
  }
  return cut === -1 ? token : token.slice(cut + 1);
}

/**
 * @param {string} utility
 * @returns {{ base: string, value: string } | null} arbitrary utility 则返回其构成，否则 null
 */
export function parseArbitraryUtility(utility) {
  const match = ARBITRARY_UTILITY_RE.exec(utility);
  if (!match || match[1] === undefined || match[2] === undefined) return null;
  return { base: match[1], value: match[2] };
}

/**
 * spacing 族 arbitrary px 值的确定性等价标度名（4px 栅格；支持 .5 档）。
 * `p-[8px]` → `p-2`；`gap-[6px]` → `gap-1.5`；非 spacing 族 / 非 0.25 倍数 / 负值 → null。
 * @param {string} base utility 名（`p`/`gap`/`w`…）
 * @param {string} value arbitrary 内值（`8px`）
 * @returns {string | null}
 */
export function spacingScaleEquivalent(base, value) {
  if (!SPACING_PREFIXES.has(base)) return null;
  const match = /^(\d+(?:\.\d+)?)px$/u.exec(value);
  if (!match || match[1] === undefined) return null;
  const units = Number(match[1]) / 4;
  if (!Number.isInteger(units * 2)) return null; // 只到 0.5 档（2px）
  if (units <= 0) return null;
  return `${base}-${units}`;
}

/**
 * 找出字符串值里的全部 arbitrary utility 违规 token（含偏移，供 fix）。
 * @param {string} value 字符串字面量的 cooked 值
 * @param {string[]} allow 白名单（utility 形态或完整 token 形态均可命中）
 * @returns {{ token: string, utility: string, offset: number }[]}
 */
export function findArbitraryTokens(value, allow) {
  const out = [];
  const re = /\S+/gu;
  let word = re.exec(value);
  while (word && word[0] !== undefined) {
    const token = word[0];
    const utility = utilityOfToken(token);
    const parsed = parseArbitraryUtility(utility);
    if (parsed && !allow.includes(utility) && !allow.includes(token)) {
      out.push({ token, utility, offset: word.index });
    }
    word = re.exec(value);
  }
  return out;
}

/**
 * 找出字符串值里的全部独立 hex 色值（跳过 arbitrary 值内部的 `-[#…`，避免与 arbitrary 双报）。
 * @param {string} value
 * @param {string[]} allow 白名单（hex 字面量）
 * @returns {{ hex: string, offset: number }[]}
 */
export function findHexTokens(value, allow) {
  const out = [];
  const re = new RegExp(HEX_TOKEN_RE.source, "gu");
  let match = re.exec(value);
  while (match && match[1] !== undefined && match[2] !== undefined) {
    const hex = `#${match[2]}`;
    const offset = match.index + match[1].length;
    if (!allow.includes(hex) && !insideArbitraryBracket(value, offset)) {
      out.push({ hex, offset });
    }
    match = re.exec(value);
  }
  return out;
}

/**
 * @param {string} value
 * @param {number} offset hex `#` 的位置
 * @returns {boolean} 是否处于 `-[…]` 值内部（归 arbitrary 规则管）
 */
function insideArbitraryBracket(value, offset) {
  const open = value.lastIndexOf("[", offset);
  if (open === -1) return false;
  const close = value.indexOf("]", open);
  return close > offset && value.slice(Math.max(0, open - 1), open + 1).endsWith("-[");
}
