/**
 * demo 守卫（M5）：把 docs/architecture.md 的纪律变成机制。
 *
 * 全部匹配器为纯函数（输入源码字符串 → 违规位置列表），guard.test.ts 负责：
 *  a) 扫真实源码断言零违规；b) 用注入的「反例字符串」验证匹配器本身抓得住（防退化）。
 * 反例只进入匹配器参数，不落任何真实源文件。
 */

export interface Violation {
  file: string;
  line: number;
  text: string;
}

function lineOf(code: string, index: number): number {
  return code.slice(0, index).split("\n").length;
}

function scan(code: string, file: string, regex: RegExp): Violation[] {
  const out: Violation[] = [];
  for (const match of code.matchAll(regex)) {
    out.push({ file, line: lineOf(code, match.index ?? 0), text: match[0].trim() });
  }
  return out;
}

/**
 * G1 禁裸 fetch：全局/裸 `fetch(` 调用（`refetch(`/`prefetch(` 等复合词不误伤；
 * 经点号的 `window.fetch(` 同样命中）。唯一合法出口 src/lib/api.ts（+ mocks/）。
 */
export function findBareFetch(code: string, file = "<memory>"): Violation[] {
  return scan(code, file, /(?<![\w$])fetch\s*\(/g);
}

/**
 * G2 禁手拼资源 queryKey：useQuery/useMutation 直调（必须经 createResource /
 * useResourceTable，queryKey/失效规则才与全局约定一致）。
 */
export function findDirectQueryHooks(code: string, file = "<memory>"): Violation[] {
  return scan(code, file, /\buseQuery\s*\(|\buseMutation\s*\(/g);
}

/** G3 禁阻塞式对话框：window.confirm / window.alert（一律用 confirm-dialog block） */
export function findBlockingDialogs(code: string, file = "<memory>"): Violation[] {
  return scan(code, file, /\bwindow\s*\.\s*(confirm|alert)\s*\(/g);
}

/**
 * G4 禁绕过 TenantProvider 直写租户记忆：'fc:last-tenant' 字面量或 TENANT_STORAGE_KEY
 * 直用（读写必须经 core tenant 模块，保证清缓存/失效联动）。
 */
export function findTenantStorageBypass(code: string, file = "<memory>"): Violation[] {
  return scan(code, file, /fc:last-tenant|TENANT_STORAGE_KEY/g);
}

/**
 * G5 blocks 禁硬编码色值：hex（#rgb/#rgba/#rrggbb/#rrggbbaa）与 rgb()/hsl() 字面量。
 * 豁免：svg data-uri 行（`data:image` 内的 %23hex）、非颜色语义的 `#` 不匹配
 * （模板插值 `#${`、锚点后非十六进制字符）。
 */
export function findHardcodedColors(code: string, file = "<memory>"): Violation[] {
  const out: Violation[] = [];
  const lines = code.split("\n");
  lines.forEach((line, i) => {
    if (line.includes("data:image")) return; // svg data-uri 豁免
    const hex = /#[0-9a-fA-F]{3,8}\b/.exec(line);
    const fn = /\b(rgba?|hsla?)\s*\(\s*\d/.exec(line);
    if (hex || fn) {
      out.push({ file, line: i + 1, text: (hex ?? fn)?.[0]?.trim() ?? line.trim() });
    }
  });
  return out;
}

/**
 * G6 防闪脚本一致性：从 index.html 提取首个内联 <script> 的关键事实
 * （localStorage key 集、默认值、写入的 DOM 属性、preset 信封解析），与 core theme 源码比对。
 * M6-B：preset 经 createStorage 持久化（{v,d} 信封）后，脚本须同时兼容裸字符串与
 * 信封两种读取形态 —— 信封解析的存在性纳入事实比对（防止镜像脚本漂移回旧格式）。
 */
export interface BlockingScriptFacts {
  storageKeys: string[];
  defaults: string[];
  attributes: string[];
  /** preset 读取是否解 createStorage {v,d} 信封（JSON.parse + .d 取值） */
  parsesEnvelope: boolean;
}

export function blockingScriptFacts(html: string): BlockingScriptFacts {
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";
  const storageKeys = [...script.matchAll(/localStorage\.getItem\("([^"]+)"\)/g)].map(
    (m) => m[1] ?? "",
  );
  const defaults = [...script.matchAll(/\|\|\s*"([^"]+)"/g)].map((m) => m[1] ?? "");
  const attributes = [...script.matchAll(/setAttribute\("([^"]+)"/g)].map((m) => m[1] ?? "");
  const parsesEnvelope = /JSON\.parse/.test(script) && /\.d\b/.test(script);
  return { storageKeys, defaults, attributes, parsesEnvelope };
}

/** 从 core theme 源码文本提取同一组事实（不 import，避免依赖构建产物） */
export function themeSourceFacts(source: string): BlockingScriptFacts {
  const pick = (name: string): string =>
    new RegExp(`export const ${name} = "([^"]+)"`).exec(source)?.[1] ?? "";
  return {
    storageKeys: [pick("THEME_STORAGE_KEY"), pick("PRESET_STORAGE_KEY")].filter(Boolean),
    defaults: [pick("DEFAULT_THEME"), pick("DEFAULT_PRESET")].filter(Boolean),
    attributes: ["data-theme", "data-preset"], // themeBlockingScript 固定写这两个属性
    // themeBlockingScript 生成器含 createStorage 信封解包段（M6-B）
    parsesEnvelope: source.includes("JSON.parse"),
  };
}
