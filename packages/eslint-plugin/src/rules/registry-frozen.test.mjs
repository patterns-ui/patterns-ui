/** registry-frozen 规则单测（RuleTester + 临时目录 fixture；三不变冻结语义）。 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import tseslintParser from "@typescript-eslint/parser";
import { RuleTester } from "eslint";
import { describe, it } from "vitest";
import rule from "./registry-frozen.mjs";

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

/**
 * @typedef {{ name?: string, metaName?: string, metaFileName?: string, targetDir?: string,
 *            frozenName?: string, frozenTargetDir?: string, unregistered?: boolean,
 *            noManifestFile?: boolean, extraFrozen?: string[] }} FixtureSpec
 */

/**
 * 造一个临时 registry fixture（blocks/<cat>/<name>/ 源文件 + meta + .freeze.json），
 * 返回可直接喂给 RuleTester 的用例（filename + 绝对路径 options 绑定同一 fixture）。
 * @param {FixtureSpec} spec
 * @param {string} code 受管文件内容
 * @param {any} [extra] 追加用例字段（errors 等；宽松以兼容 RuleTester 用例形状）
 */
function caseFor(spec, code, extra = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pi-freeze-"));
  const blocksRoot = path.join(root, "registry", "blocks");
  const manifestPath = path.join(root, "registry", ".freeze.json");
  const name = spec.name ?? "copy-button";
  const targetDir = spec.targetDir ?? `components/blocks/shared/${name}`;
  const dir = path.join(blocksRoot, "shared", name);
  fs.mkdirSync(dir, { recursive: true });
  const meta = {
    name: spec.metaName ?? name,
    type: "registry:block",
    title: name,
    categories: ["shared"],
    dependencies: [],
    registryDependencies: [],
    targetDir,
  };
  const file = path.join(dir, `${name}.tsx`);
  fs.writeFileSync(file, `export const x = ${JSON.stringify(code)};\n`, "utf8");
  fs.writeFileSync(
    path.join(dir, spec.metaFileName ?? `${name}.meta.json`),
    `${JSON.stringify(meta, null, 2)}\n`,
    "utf8",
  );

  if (spec.noManifestFile !== true) {
    /** @type {Record<string, { name: string, targetDir: string }>} */
    const blocks = {};
    if (spec.unregistered !== true) {
      blocks[`shared/${name}`] = {
        name: spec.frozenName ?? name,
        targetDir: spec.frozenTargetDir ?? targetDir,
      };
    }
    for (const extraKey of spec.extraFrozen ?? []) {
      blocks[extraKey] = {
        name: path.basename(extraKey),
        targetDir: `components/blocks/${extraKey}`,
      };
    }
    fs.writeFileSync(
      manifestPath,
      `${JSON.stringify({ $comment: "test", blocks }, null, 2)}\n`,
      "utf8",
    );
  }

  return {
    code,
    filename: file,
    options: [{ manifest: manifestPath, blocksRoot }],
    ...extra,
  };
}

ruleTester.run("registry-frozen", rule, {
  valid: [
    caseFor({}, "export const x = 1;", { name: "已登记且三键一致 → 通过" }),
    // 注：RuleTester 的 name 字段不是标准属性，仅作文档；实际 name 放 code 首行注释。
  ],
  invalid: [
    caseFor({ unregistered: true }, "export const x = 1;", {
      errors: [{ messageId: "unregistered", data: { dir: "shared/copy-button" } }],
    }),
    caseFor(
      // 目录复制/半改名：dir 名与 meta 文件名/meta.name 不一致——归属按路径判定（与 build.ts 扫描口径一致）
      {
        name: "copy-button-renamed",
        metaName: "copy-button",
        metaFileName: "copy-button.meta.json",
        unregistered: true,
      },
      "export const x = 1;",
      {
        errors: [{ messageId: "unregistered", data: { dir: "shared/copy-button-renamed" } }],
      },
    ),
    caseFor({ frozenName: "old-name" }, "export const x = 1;", {
      errors: [
        {
          messageId: "nameChanged",
          data: { dir: "shared/copy-button", from: "old-name", to: "copy-button" },
        },
      ],
    }),
    caseFor({ frozenTargetDir: "components/blocks/old/place" }, "export const x = 1;", {
      errors: [
        {
          messageId: "targetDirChanged",
          data: {
            dir: "shared/copy-button",
            from: "components/blocks/old/place",
            to: "components/blocks/shared/copy-button",
          },
        },
      ],
    }),
    caseFor({ extraFrozen: ["shared/ghost-block"] }, "export const x = 1;", {
      errors: [{ messageId: "missing", data: { dirs: "shared/ghost-block" } }],
    }),
    caseFor({ noManifestFile: true }, "export const x = 1;", {
      errors: [{ messageId: "noManifest" }],
    }),
  ],
});
