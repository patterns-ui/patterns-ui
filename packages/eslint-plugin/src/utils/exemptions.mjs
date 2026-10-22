/**
 * 豁免注释工具：逐处豁免的唯一通道（与规则选项白名单互补）。
 *
 * 约定（写进规则报错信息，报错即目录）：
 * - `patterns-ui-allow-color`：hex / arbitrary tailwind 豁免（该行）；
 * - `patterns-ui-allow-raw`：裸原语豁免（该行）；
 * - `patterns-ui-allow`：以上皆豁免（该行）。
 * 注释须与违规节点同行（行尾或行首）。
 */

/** 豁免注释标记 → 逐规则族识别 */
const ALLOW_COMMENT = /patterns-ui-allow(?:-(?:color|raw))?/u;

/** color 族（hex/arbitrary tailwind）豁免标记 */
const ALLOW_COLOR_COMMENT = /patterns-ui-allow(?:-color)?/u;

/** raw 原语族豁免标记 */
const ALLOW_RAW_COMMENT = /patterns-ui-allow(?:-raw)?/u;

/**
 * 节点行内是否带指定族豁免注释。
 * @param {import("eslint").SourceCode} sourceCode
 * @param {import("estree").Node} node
 * @param {RegExp} marker
 * @returns {boolean}
 */
export function hasLineAllowComment(sourceCode, node, marker) {
  const startLine = node.loc?.start.line ?? -1;
  const endLine = node.loc?.end.line ?? startLine;
  return sourceCode.getAllComments().some((comment) => {
    if (!marker.test(comment.value) || comment.loc === null || comment.loc === undefined) {
      return false;
    }
    const line = comment.loc.start.line;
    return (line >= startLine && line <= endLine) || line === endLine;
  });
}

/** @returns {RegExp} color 族标记（导出常量语义） */
export function colorAllowMarker() {
  return ALLOW_COLOR_COMMENT;
}

/** @returns {RegExp} raw 族标记 */
export function rawAllowMarker() {
  return ALLOW_RAW_COMMENT;
}

/** @returns {RegExp} 通用标记（调试/文档用） */
export function anyAllowMarker() {
  return ALLOW_COMMENT;
}

/**
 * 文件头是否带 `// sandbox:` 登记注释（sandbox 棘轮是 pages 0-JSX 的登记制逃生位，
 * paradigm §3.5/§3.3；只认首语句之前的注释）。
 * @param {import("eslint").SourceCode} sourceCode
 * @param {import("estree").Program} program
 * @returns {boolean}
 */
export function hasSandboxHeader(sourceCode, program) {
  const first = program.body[0];
  const headerEnd = first?.range?.[0] ?? Number.POSITIVE_INFINITY;
  return sourceCode.getAllComments().some((comment) => {
    if (comment.range === undefined || comment.range[1] > headerEnd) return false;
    // Line 注释的 value 已剥离 `//`、Block 注释行带 `*` 前缀——两者都认
    return /(^|\n)\s*(?:\/{2,}|\*+)?\s*sandbox:/u.test(comment.value);
  });
}
