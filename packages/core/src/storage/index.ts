/**
 * core/storage —— localStorage 统一存储（docs/paradigm.md §5-B createStorage）。
 *
 * 单点收敛全部偏好语义的本地持久化（core 模块与 blocks 禁止再裸读写 localStorage）：
 *  - zod schema 校验读出的数据（坏值/超集静默弃用，回落缺省）；
 *  - 信封格式 `{ v: <version>, d: <data> }` 携带版本；
 *  - 旧版本数据经 migrate 升级（fromVersion 0 = 信封化之前的裸格式，含非 JSON 裸字符串）；
 *  - 租户隔离选项（tenantId → 最终 key 拼 `${key}:${tenantId}`，与 fc: 段约定一致）。
 *
 * 读写均已 try/catch 收敛：非浏览器环境 / 隐私模式静默降级为「无存储」（read 返回 undefined）。
 * 防闪内联脚本无法 import 本模块（见 theme.themeBlockingScript 的镜像读取逻辑，
 * apps/demo/index.html 与 demo guards G6 负责三处同步校验）。
 */
import type { z } from "zod";

export interface StorageMigrateContext {
  /** 数据写入时的版本号；0 = 信封化之前的裸格式 */
  fromVersion: number;
}

export interface CreateStorageOptions {
  /** 数据版本（默认 1）。读取时旧版本（含信封前的裸格式 version 0）经 migrate 升级 */
  version?: number;
  /**
   * 旧数据迁移：输入旧存储值（信封前的裸 JSON/裸字符串或旧信封的 d），返回当前版本形状；
   * 缺省时旧格式直接弃用（显式弃用决策）。迁移结果仍须过 schema 校验，失败即弃用。
   */
  migrate?: (stored: unknown, ctx: StorageMigrateContext) => unknown;
  /** 租户隔离：提供后最终 key 为 `${key}:${tenantId}`（tenant-scoped key 拼装单点） */
  tenantId?: string;
}

/** 信封格式：版本 + 数据载荷 */
interface StorageEnvelope {
  v: number;
  d: unknown;
}

function isEnvelope(value: unknown): value is StorageEnvelope {
  return (
    typeof value === "object" &&
    value !== null &&
    "v" in value &&
    "d" in value &&
    typeof (value as StorageEnvelope).v === "number"
  );
}

/** 本模块用到的 localStorage 最小面（避免与导出的 Storage<TData> 接口重名遮蔽 DOM 类型） */
interface LocalStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function localStorageRef(): LocalStorageLike | undefined {
  try {
    return globalThis.localStorage ?? undefined;
  } catch {
    return undefined;
  }
}

export interface Storage<TData> {
  /** 最终存储 key（含租户段；诊断/测试用） */
  readonly fullKey: string;
  /** 读取并校验；无数据/坏值/未迁移的旧格式 → undefined */
  read(): TData | undefined;
  /** 写入当前版本信封；非浏览器环境静默降级 */
  write(value: TData): void;
  /** 删除存储项 */
  remove(): void;
}

/**
 * 创建一个受 schema 约束的 localStorage 存储项。
 * key 遵循仓库 `fc:<域>:<标识>` 约定（savedViewsKey/draftKey 等工厂产出）。
 */
export function createStorage<TData>(
  key: string,
  schema: z.ZodType<TData>,
  opts?: CreateStorageOptions,
): Storage<TData> {
  const version = opts?.version ?? 1;
  const migrate = opts?.migrate;
  const fullKey = opts?.tenantId !== undefined ? `${key}:${opts.tenantId}` : key;

  /** 任意存储值（信封/裸 JSON/裸字符串）→ 当前版本数据（经 schema 校验） */
  function materialize(raw: string): TData | undefined {
    let stored: unknown;
    let fromVersion: number;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      // 信封前的裸字符串（如 fc:last-tenant 的 "t-abc"）：整串交给 migrate
      parsed = undefined;
    }
    if (parsed !== undefined && isEnvelope(parsed)) {
      stored = parsed.d;
      fromVersion = parsed.v;
      if (fromVersion > version) return undefined; // 未来版本（降级运行）弃用，防误读
    } else {
      // 信封之前的裸格式（可解析 JSON 或不可解析裸串）= version 0
      stored = parsed !== undefined ? parsed : raw;
      fromVersion = 0;
    }
    const candidate = fromVersion === version ? stored : migrate?.(stored, { fromVersion });
    if (candidate === undefined) return undefined;
    const result = schema.safeParse(candidate);
    return result.success ? result.data : undefined;
  }

  return {
    fullKey,
    read() {
      let raw: string | null = null;
      try {
        raw = localStorageRef()?.getItem(fullKey) ?? null;
      } catch {
        return undefined;
      }
      if (raw === null) return undefined;
      return materialize(raw);
    },
    write(value: TData) {
      try {
        const envelope: StorageEnvelope = { v: version, d: value };
        localStorageRef()?.setItem(fullKey, JSON.stringify(envelope));
      } catch {
        /* 非浏览器环境 / 配额/隐私模式：静默放弃持久化 */
      }
    },
    remove() {
      try {
        localStorageRef()?.removeItem(fullKey);
      } catch {
        /* 非浏览器环境 */
      }
    },
  };
}
