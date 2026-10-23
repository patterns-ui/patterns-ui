/**
 * core/meta —— 元模式公共机制（M7-C2，docs/paradigm.md §1.2 / §6-C2；docs/core-api.md §18）。
 *
 * 元模式（headless 行为引擎）的声明与 dev 期适配器校验：
 *  - META_PATTERN_NAMES：元模式封闭词表（paradigm §1.2 清单 16 值，表序即输出序）。
 *    **与 registry/scripts/build.ts 的 META_PATTERNS 同源硬编码两处**（改清单属 ①象限
 *    变更纪律，两处与 paradigm §1.2 表同步改）；
 *  - defineMetaPattern：元模式契约对象（name + contractVersion + adapterShape 的 zod 形状）；
 *  - validateMetaPatternAdapter：dev-only 适配器形状校验 + contractVersion 失配警告
 *    （paradigm §1.2「core 元模式 hook 在 dev 模式对注入 adapter 做形状校验，版本不匹配即警告」）。
 *    生产零开销：NODE_ENV=production 直接返回，不执行 zod parse。
 *
 * 消费方式：各元模式引擎（audit / read / …）在自己模块内 defineMetaPattern 产出契约常量，
 * 在 hook 挂载处调 validateMetaPatternAdapter 校验注入的 adapter（一次性、幂等）。
 */
import type { z } from "zod";

/**
 * 元模式封闭词表（paradigm §1.2「元模式清单」16 值；现状列见该表——前 8 已有 core 落点、
 * audit-trail/read-state 于 M7-C2 抽取、后 6 为 M8 波次名）。元模式命名规约：与业务模式名
 * 不得同名，用行为语义后缀（-lifecycle / -pipeline / -delivery / -matrix / -state）。
 */
export const META_PATTERN_NAMES = [
  "resource-lifecycle",
  "list-browse",
  "reference-resolution",
  "multi-tenant",
  "auth-rbac",
  "task-polling",
  "new-items-signal",
  "flow",
  "audit-trail",
  "read-state",
  "billing-lifecycle",
  "api-key-lifecycle",
  "import-pipeline",
  "comment-thread",
  "webhook-delivery",
  "permission-matrix",
] as const;

/** 元模式名（封闭词表派生联合——报错信息即目录） */
export type MetaPatternName = (typeof META_PATTERN_NAMES)[number];

/** 元模式契约：名字 + 契约版本 + 适配器期望形状（zod schema，dev 期 safeParse 校验注入对象） */
export interface MetaPatternContract {
  readonly name: MetaPatternName;
  /** 契约卡版本（业务模式契约卡与元模式引擎各持一份；失配警告的对照值） */
  readonly contractVersion: number;
  /** 适配器期望形状（消费方经 defineMetaPattern 传入具型 schema；校验接收 unknown 注入对象） */
  readonly adapterShape: z.ZodType<unknown>;
}

/** 元模式契约工厂：名字入封闭词表（报错列全表）、版本为正整数；纯校验，可脱离渲染测试 */
export function defineMetaPattern<TSchema extends z.ZodType>(
  name: MetaPatternName,
  contractVersion: number,
  adapterShape: TSchema,
): MetaPatternContract {
  if (!(META_PATTERN_NAMES as readonly string[]).includes(name)) {
    throw new Error(
      `defineMetaPattern: 未知元模式名「${name}」（合法值：[${META_PATTERN_NAMES.join(", ")}]——封闭词表，新增走 paradigm §1.2 变更纪律）`,
    );
  }
  if (!Number.isInteger(contractVersion) || contractVersion < 1) {
    throw new Error(
      `defineMetaPattern(${name}): contractVersion 必须为正整数（收到 ${String(contractVersion)}）`,
    );
  }
  return { name, contractVersion, adapterShape };
}

/** 适配器可选携带的契约版本（消费端从契约卡抄写；不携带则跳过版本核对） */
export interface MetaPatternAdapterVersion {
  contractVersion?: number;
}

export interface ValidateAdapterOptions {
  /** 消费方名（警告前缀定位，如 "useAuditTrail"） */
  consumer?: string;
  /** 注入 env（测试用；缺省读 globalThis.process.env.NODE_ENV） */
  env?: { NODE_ENV?: string };
  /** 注入 warn（测试用；缺省 console.warn） */
  warn?: (message: string) => void;
}

/**
 * dev-only 适配器校验（引擎 hook 挂载时调用）：
 *  - contractVersion 失配 → console.warn（携带期望 contractVersion 与契约卡指引，不阻断）；
 *  - adapterShape safeParse 失败 → console.warn 列出字段级 issue 与期望契约版本（不阻断——
 *    引擎按原样使用注入对象，适配器实现与契约卡不一致时尽早暴露）；
 *  - NODE_ENV=production 立即返回（生产零开销，不执行 zod parse）。
 */
export function validateMetaPatternAdapter(
  pattern: MetaPatternContract,
  adapter: unknown,
  opts?: ValidateAdapterOptions,
): void {
  const env =
    opts?.env ??
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  if (env?.NODE_ENV === "production") return;
  const warn =
    opts?.warn ??
    ((message: string) => {
      console.warn(message);
    });
  const where = `[meta-pattern:${pattern.name}]${opts?.consumer ? ` ${opts.consumer}:` : ""}`;

  const carried = (adapter as MetaPatternAdapterVersion | null | undefined)?.contractVersion;
  if (typeof carried === "number" && carried !== pattern.contractVersion) {
    warn(
      `${where} 适配器 contractVersion ${carried} ≠ 引擎契约 v${pattern.contractVersion}——` +
        `按对应业务模式契约卡（registry/patterns/*.contract.md）核对该元模式的适配器形状后再升级；` +
        "继续运行，但行为可能与契约漂移。",
    );
  }

  const parsed = pattern.adapterShape.safeParse(adapter);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    warn(
      `${where} 适配器形状不符（期望形状见引擎契约 v${pattern.contractVersion}）：${issues}。` +
        "注入对象将被原样使用——适配器实现与契约卡不一致。",
    );
  }
}
