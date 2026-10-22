/**
 * demo 守卫测试（M5，docs/milestones.md M5-2）。
 *
 * 六条守卫扫真实源码（vitest node 环境，纯字符串扫描，不渲染组件）：
 *  G1 禁裸 fetch（唯一出口 src/lib/api.ts；mocks/ 是 mock 服务端，豁免）
 *  G2 禁手拼资源 queryKey（useQuery/useMutation 直调必须经 createResource/useResourceTable）
 *  G3 禁 window.confirm/alert（用 confirm-dialog block）
 *  G4 禁绕过 TenantProvider 直写 'fc:last-tenant'（core 源在 packages/core，不在扫描范围）
 *  G5 registry blocks 禁硬编码色值（svg data-uri 豁免）
 *  G6 index.html 防闪内联脚本与 core themeBlockingScript 关键逻辑等价（key/默认值/属性）
 *
 * 每条守卫配「注入反例」自测：反例只作为字符串传给匹配器（不落真实源码），
 * 验证匹配器本身能抓到 —— 防止守卫因重构而悄悄失效。
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  blockingScriptFacts,
  findBareFetch,
  findBlockingDialogs,
  findDirectQueryHooks,
  findHardcodedColors,
  findTenantStorageBypass,
  themeSourceFacts,
  type Violation,
} from "./matchers";

const DEMO_SRC = fileURLToPath(new URL("../", import.meta.url));
const APP_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const REPO_ROOT = join(APP_ROOT, "..", "..");

/** 递归收集 .ts/.tsx 文件 */
function collectTsFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "guards") continue; // 守卫机制自身（含反例字符串）豁免全部扫描
      collectTsFiles(full, out);
    } else if (/\.tsx?$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

const DEMO_FILES = collectTsFiles(DEMO_SRC).map((f) => ({
  path: f,
  rel: relative(join(REPO_ROOT, "apps/demo"), f),
  code: readFileSync(f, "utf8"),
}));

function expectZero(violations: Violation[], guard: string): void {
  const detail = violations.map((v) => `${v.file}:${v.line} ${v.text}`).join("\n");
  expect(violations, `[${guard}] 发现违规：\n${detail}`).toEqual([]);
}

// ---------------------------------------------------------------------------
// G1 裸 fetch
// ---------------------------------------------------------------------------

describe("G1 禁裸 fetch（出口唯一：src/lib/api.ts）", () => {
  const FETCH_ALLOWED = (rel: string) => rel === "src/lib/api.ts" || rel.startsWith("src/mocks/");

  it("demo src（api.ts/mocks 外）零裸 fetch", () => {
    const violations = DEMO_FILES.filter((f) => !FETCH_ALLOWED(f.rel)).flatMap((f) =>
      findBareFetch(f.code, f.rel),
    );
    expectZero(violations, "G1");
  });

  it("反例：裸 fetch / window.fetch 会被抓到；refetch/prefetch 不误伤", () => {
    expect(findBareFetch("const r = await fetch('/api/x');")).toHaveLength(1);
    expect(findBareFetch("void window.fetch(url);")).toHaveLength(1);
    expect(findBareFetch("list.query.refetch()")).toHaveLength(0);
    expect(findBareFetch("router.prefetch('/services')")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// G2 手拼资源 queryKey
// ---------------------------------------------------------------------------

describe("G2 禁手拼资源 queryKey（useQuery/useMutation 直调）", () => {
  /**
   * 白名单（按现有代码实际情况，逐一有理由）：
   *  - src/resources.ts / src/resources-m4.ts：createResource 注册地（本守卫保护的约定来源）
   *  - src/routes/_shell/t.$tenantId.regions.tsx：树形演示页静态读取（ResourceClient.list 直调，
   *    树表无 URL 查询语义，非资源列表）
   *  - src/routes/_shell/t.$tenantId.settings.tsx：/api/me 与 /api/orgs 单例读取
   *    （非资源集合，无失效联动诉求）
   */
  const QUERY_ALLOWED = (rel: string) =>
    rel === "src/resources.ts" ||
    rel === "src/resources-m4.ts" ||
    rel.endsWith("t.$tenantId.regions.tsx") ||
    rel.endsWith("t.$tenantId.settings.tsx");

  it("demo src（白名单外）零 useQuery/useMutation 直调", () => {
    const violations = DEMO_FILES.filter((f) => !QUERY_ALLOWED(f.rel)).flatMap((f) =>
      findDirectQueryHooks(f.code, f.rel),
    );
    expectZero(violations, "G2");
  });

  it("反例：useQuery/useMutation 直调会被抓到；useQueryClient 不算", () => {
    expect(findDirectQueryHooks("const q = useQuery({ queryKey: ['x'] })")).toHaveLength(1);
    expect(findDirectQueryHooks("const m = useMutation({ mutationFn: fn })")).toHaveLength(1);
    expect(findDirectQueryHooks("const qc = useQueryClient()")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// G3 阻塞式对话框
// ---------------------------------------------------------------------------

describe("G3 禁 window.confirm/alert", () => {
  it("demo src 零阻塞式对话框", () => {
    const violations = DEMO_FILES.flatMap((f) => findBlockingDialogs(f.code, f.rel));
    expectZero(violations, "G3");
  });

  it("反例：window.confirm/alert 会被抓到", () => {
    expect(findBlockingDialogs("if (window.confirm('删除？')) del();")).toHaveLength(1);
    expect(findBlockingDialogs("window.alert('boom');")).toHaveLength(1);
    expect(findBlockingDialogs("<ConfirmDialog open={o} onConfirm={del} />")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// G4 租户记忆直写
// ---------------------------------------------------------------------------

describe("G4 禁绕过 TenantProvider 直写 'fc:last-tenant'", () => {
  it("demo src 与 registry blocks 零直写", () => {
    const blockDir = join(REPO_ROOT, "registry", "blocks");
    const blockFiles = existsSync(blockDir)
      ? collectTsFiles(blockDir).map((f) => ({
          path: f,
          rel: relative(REPO_ROOT, f),
          code: readFileSync(f, "utf8"),
        }))
      : [];
    const violations = [...DEMO_FILES, ...blockFiles].flatMap((f) =>
      findTenantStorageBypass(f.code, f.rel),
    );
    expectZero(violations, "G4");
  });

  it("反例：字面量与 TENANT_STORAGE_KEY 直用都会被抓到", () => {
    expect(findTenantStorageBypass('localStorage.setItem("fc:last-tenant", id)')).toHaveLength(1);
    expect(findTenantStorageBypass("import { TENANT_STORAGE_KEY } from 'x'")).toHaveLength(1);
    expect(findTenantStorageBypass('localStorage.setItem("demo:token", t)')).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// G5 blocks 硬编码色值
// ---------------------------------------------------------------------------

describe("G5 registry blocks 禁硬编码色值", () => {
  const BLOCK_DIR = join(REPO_ROOT, "registry", "blocks");

  it("blocks 零 hex/rgb/hsl 字面量（svg data-uri 豁免）", () => {
    const violations = collectTsFiles(BLOCK_DIR).flatMap((f) =>
      findHardcodedColors(readFileSync(f, "utf8"), relative(REPO_ROOT, f)),
    );
    expectZero(violations, "G5");
  });

  it("反例：hex/rgb/hsl 会被抓到；data-uri 内 hex 与主题 token 豁免", () => {
    expect(findHardcodedColors('<div className="text-[#ff5733]">x</div>')).toHaveLength(1);
    expect(findHardcodedColors('style={{ background: "#fff" }}')).toHaveLength(1);
    expect(findHardcodedColors('style={{ color: "rgb(12, 34, 56)" }}')).toHaveLength(1);
    expect(findHardcodedColors('style={{ color: "hsla(210, 50%, 40%, 0.5)" }}')).toHaveLength(1);
    expect(findHardcodedColors('src="data:image/svg+xml,%23fff"')).toHaveLength(0);
    expect(findHardcodedColors('className="bg-primary text-muted-foreground"')).toHaveLength(0);
    // 模板插值前缀（`${` 非 hex）不误伤
    // biome-ignore lint/suspicious/noTemplateCurlyInString: 反例字面内容就是模板插值文本（验证匹配器不误伤）
    expect(findHardcodedColors("`#${values.length}`")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// G6 防闪脚本一致性
// ---------------------------------------------------------------------------

describe("G6 index.html 防闪脚本与 core themeBlockingScript 等价", () => {
  const html = readFileSync(join(APP_ROOT, "index.html"), "utf8");
  const themeSource = readFileSync(
    join(REPO_ROOT, "packages", "core", "src", "theme", "index.tsx"),
    "utf8",
  );

  it("localStorage key、默认值、DOM 属性、preset 信封解析与 core 常量一致", async () => {
    const htmlFacts = blockingScriptFacts(html);
    const coreFacts = themeSourceFacts(themeSource);
    expect(new Set(htmlFacts.storageKeys)).toEqual(new Set(coreFacts.storageKeys));
    expect(new Set(htmlFacts.defaults)).toEqual(new Set(coreFacts.defaults));
    expect(new Set(htmlFacts.attributes)).toEqual(new Set(coreFacts.attributes));
    expect(htmlFacts.parsesEnvelope).toBe(coreFacts.parsesEnvelope);
  });

  it("反例：key 漂移（fc:theme → fc:mode）会被事实比对抓到", async () => {
    const drifted = blockingScriptFacts(
      '<script>(() => { var t = localStorage.getItem("fc:mode") || "dark"; })();</script>',
    );
    const coreFacts = themeSourceFacts(themeSource);
    expect(new Set(drifted.storageKeys)).not.toEqual(new Set(coreFacts.storageKeys));
  });

  it("反例：preset 信封解析缺失（漂移回旧裸字符串读取）会被事实比对抓到", async () => {
    const legacy = blockingScriptFacts(
      '<script>(() => { var t = localStorage.getItem("fc:theme") || "dark"; var p = localStorage.getItem("fc:preset") || "default"; })();</script>',
    );
    const coreFacts = themeSourceFacts(themeSource);
    expect(legacy.parsesEnvelope).not.toBe(coreFacts.parsesEnvelope);
  });
});
