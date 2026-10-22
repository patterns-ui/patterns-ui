/**
 * registry-frozen —— registry meta 冻结：路径（block 目录名）/name/targetDir 三不变，内容可变
 * （哈希不冻结；paradigm §6 B1、docs/registry.md §7）。
 *
 * 违规 = 新增/改名/移动 block 未走豁免流程。豁免流程 = 重新生成冻结清单
 * （`pnpm --filter @patterns-ui/eslint-plugin freeze:regen`）+ PR 附理由注释。
 *
 * 实现：仓内快照清单（默认 registry/.freeze.json，选项可覆盖——规则不依赖仓内路径，
 * 路径决策由消费方 config 提供）。块扫描结果按 blocksRoot 进程内缓存一次（CLI 一次性运行语义）。
 */

import path from "node:path";
import { missingFrozenDirs, owningBlockDir, readManifest, scanBlocks } from "../utils/freeze.mjs";

/** @type {Map<string, { kind: "ok" | "no-manifest", frozen: Record<string, { name: string, targetDir: string }>, current: Map<string, { name: string, targetDir: string }> }>} */
const scanCache = new Map();

/** 全局级违规（清单缺失/目录消失）每 blocksRoot 只报一次（无文件可挂靠时的落点） */
const globalReported = new Set();

/**
 * @param {string} rootAbs
 * @param {string} manifestAbs
 */
function loadScan(rootAbs, manifestAbs) {
  let scan = scanCache.get(rootAbs);
  if (!scan) {
    const manifest = readManifest(manifestAbs);
    scan = manifest
      ? { kind: "ok", frozen: manifest.blocks, current: scanBlocks(rootAbs) }
      : { kind: "no-manifest", frozen: {}, current: scanBlocks(rootAbs) };
    scanCache.set(rootAbs, scan);
  }
  return scan;
}

/** @type {import("eslint").Rule.RuleModule} */
const rule = {
  meta: {
    type: "problem",
    docs: { description: "registry meta 冻结：路径/name/targetDir 三不变（内容可变）" },
    schema: [
      {
        type: "object",
        properties: {
          manifest: { type: "string" },
          blocksRoot: { type: "string" },
        },
        additionalProperties: false,
      },
    ],
    messages: {
      noManifest:
        "冻结清单不存在（{{manifest}}）：先跑 `pnpm --filter @patterns-ui/eslint-plugin freeze:regen` 生成并提交（docs/registry.md §7）。",
      unregistered:
        "block 目录 {{dir}} 未在冻结清单登记：新增 block 须跑 freeze:regen 再生成清单并在 PR 附理由（docs/registry.md §7）。",
      missing:
        "冻结清单中的 block 目录已删除/改名/移动：{{dirs}}。改名不豁免（词表与 registryDependencies 断链）——如确须变更，跑 freeze:regen 并在 PR 附理由。",
      nameChanged:
        "block {{dir}} 的 name 已变更（{{from}} → {{to}}）：name 冻结（消费端 registryDependencies 断链）；回退或在 PR 中说明并再生成清单。",
      targetDirChanged:
        "block {{dir}} 的 targetDir 已变更（{{from}} → {{to}}）：targetDir 冻结（消费端安装路径漂移）；回退或走清单再生成豁免流程。",
    },
  },
  /** @param {import("eslint").Rule.RuleContext} context */
  create(context) {
    const opts = context.options[0] ?? {};
    const manifestRel = opts.manifest ?? "registry/.freeze.json";
    const rootRel = opts.blocksRoot ?? "registry/blocks";
    const cwd = context.cwd ?? process.cwd();
    const manifestAbs = path.resolve(cwd, manifestRel);
    const rootAbs = path.resolve(cwd, rootRel);
    const filename = context.physicalFilename ?? context.filename ?? "";

    if (!filename.startsWith(`${rootAbs}${path.sep}`)) return {};
    const scan = loadScan(rootAbs, manifestAbs);
    const ownerDir = owningBlockDir(rootAbs, filename);

    return {
      /** @param {import("estree").Program} node */
      Program(node) {
        // 全局级违规（挂靠本次运行的第一个受管文件，每 blocksRoot 一次）
        if (!globalReported.has(rootAbs)) {
          globalReported.add(rootAbs);
          if (scan.kind === "no-manifest") {
            context.report({ node, messageId: "noManifest", data: { manifest: manifestRel } });
          } else {
            const missing = missingFrozenDirs(scan.frozen, scan.current);
            if (missing.length > 0) {
              context.report({ node, messageId: "missing", data: { dirs: missing.join(", ") } });
            }
          }
        }
        if (ownerDir === null || scan.kind === "no-manifest") return;
        const frozen = scan.frozen[ownerDir];
        if (!frozen) {
          context.report({ node, messageId: "unregistered", data: { dir: ownerDir } });
          return;
        }
        const current = scan.current.get(ownerDir);
        if (current && current.name !== frozen.name) {
          context.report({
            node,
            messageId: "nameChanged",
            data: { dir: ownerDir, from: frozen.name, to: current.name },
          });
        }
        if (current && current.targetDir !== frozen.targetDir) {
          context.report({
            node,
            messageId: "targetDirChanged",
            data: { dir: ownerDir, from: frozen.targetDir, to: current.targetDir },
          });
        }
      },
    };
  },
};

export default rule;
