/**
 * core/datetime —— 时间单源（docs/core-api.md §11）。
 *
 * 偏好（时区/hour12/绝对格式）存 localStorage 'fc:datetime'（偏好语义，不进 URL）；
 * 默认时区 = 系统时区（prefs.timeZone 缺省时 Intl 自行解析）。
 * Intl.DateTimeFormat 按 (tz, opts) 键缓存；DST 由 Intl 正确处理。
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { z } from "zod";
import { useMounted } from "../mounted";
import { createStorage } from "../storage";

export { useMounted };

export interface DateTimePrefs {
  timeZone?: string;
  hour12?: boolean;
  absolutePattern?: "full" | "date" | "datetime";
}

export const DATETIME_STORAGE_KEY = "fc:datetime";

const EMPTY_PREFS: DateTimePrefs = {};

// ---------------------------------------------------------------------------
// 偏好存储：模块级 store（多组件共享同一份，setPrefs 即时广播）。
// 持久化经 createStorage 单源（信封 + zod 校验）；首次读取发生在 effect（prime）内。
// ---------------------------------------------------------------------------

const dateTimePrefsSchema = z.object({
  timeZone: z.string().optional(),
  hour12: z.boolean().optional(),
  absolutePattern: z.enum(["full", "date", "datetime"]).optional(),
});

/** 偏好存储（旧裸 JSON 对象经 migrate 无损沿用；坏值弃用回落默认时区） */
function prefsStorage() {
  return createStorage(DATETIME_STORAGE_KEY, dateTimePrefsSchema, {
    version: 1,
    // 信封前格式 = DateTimePrefs 裸 JSON 对象：直接沿用（字段校验交给 schema）
    migrate: (raw) => raw,
  });
}

let prefsCache: DateTimePrefs = EMPTY_PREFS;
let primed = false;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

/** 从 localStorage 恢复偏好（幂等；useDateTimePrefs 挂载时调用） */
export function primeDateTimePrefs(): void {
  if (primed) {
    return;
  }
  primed = true;
  const restored = prefsStorage().read();
  if (restored) {
    prefsCache = restored;
    emit();
  }
}

/** 直接写入偏好（合并语义）并持久化；事件/effect 内调用 */
export function writeDateTimePrefs(patch: Partial<DateTimePrefs>): void {
  prefsCache = { ...prefsCache, ...patch };
  prefsStorage().write(prefsCache);
  emit();
}

export function useDateTimePrefs(): {
  prefs: DateTimePrefs;
  setPrefs: (p: Partial<DateTimePrefs>) => void;
} {
  const subscribe = useCallback((cb: () => void) => {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);
  const getSnapshot = useCallback(() => prefsCache, []);
  const prefs = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => EMPTY_PREFS, // 非 DOM 环境快照
  );

  // localStorage 首读收敛在 effect 内
  useEffect(() => {
    primeDateTimePrefs();
  }, []);

  const setPrefs = useCallback((p: Partial<DateTimePrefs>) => writeDateTimePrefs(p), []);
  return { prefs, setPrefs };
}

// ---------------------------------------------------------------------------
// 绝对格式化（Intl 按 (tz, opts) 键缓存）
// ---------------------------------------------------------------------------

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function patternOptions(
  pattern: NonNullable<DateTimePrefs["absolutePattern"]>,
): Intl.DateTimeFormatOptions {
  switch (pattern) {
    case "date":
      return { dateStyle: "medium" };
    case "full":
      return { dateStyle: "full", timeStyle: "medium" };
    default:
      return { dateStyle: "medium", timeStyle: "short" };
  }
}

function getFormatter(prefs: DateTimePrefs): Intl.DateTimeFormat {
  const pattern = prefs.absolutePattern ?? "datetime";
  const key = JSON.stringify([prefs.timeZone ?? "", prefs.hour12 ?? null, pattern]);
  let formatter = formatterCache.get(key);
  if (!formatter) {
    const options: Intl.DateTimeFormatOptions = patternOptions(pattern);
    if (prefs.hour12 !== undefined) {
      options.hour12 = prefs.hour12;
    }
    formatter =
      prefs.timeZone !== undefined
        ? new Intl.DateTimeFormat(undefined, { ...options, timeZone: prefs.timeZone })
        : new Intl.DateTimeFormat(undefined, options);
    formatterCache.set(key, formatter);
  }
  return formatter;
}

function toDate(value: string | number | Date): Date | undefined {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

// ---------------------------------------------------------------------------
// ISO 日期字符串判定（M6-B 工具单点化：filters 的日期比较与 resource 的类型推断共用）
// ---------------------------------------------------------------------------

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}([T ].*)?$/;

/** ISO 日期形状判定（`YYYY-MM-DD` 或带 `T`/空格 时间部分；时间单源 datetime 收敛） */
export function isIsoDate(value: string): boolean {
  return ISO_DATE_RE.test(value);
}

export function formatAbsolute(value: string | number | Date, prefs: DateTimePrefs): string {
  const date = toDate(value);
  if (!date) {
    return String(value);
  }
  return getFormatter(prefs).format(date);
}

// ---------------------------------------------------------------------------
// 相对格式化（just now / Ns / Nm / Nh / Nd，超 7 天回绝对）
// ---------------------------------------------------------------------------

const MINUTE = 60;
const HOUR = 3600;
const DAY = 86400;
const WEEK = 7 * DAY;
const JUST_NOW_THRESHOLD = 10; // 秒

export function formatRelative(value: string | number | Date, now: number = Date.now()): string {
  const date = toDate(value);
  if (!date) {
    return String(value);
  }
  const diffSeconds = Math.round((date.getTime() - now) / 1000);
  const abs = Math.abs(diffSeconds);
  const future = diffSeconds > 0;
  if (abs < JUST_NOW_THRESHOLD) {
    return "just now";
  }
  const bucketed =
    abs < MINUTE
      ? `${abs}s`
      : abs < HOUR
        ? `${Math.floor(abs / MINUTE)}m`
        : abs < DAY
          ? `${Math.floor(abs / HOUR)}h`
          : abs <= WEEK
            ? `${Math.floor(abs / DAY)}d`
            : null;
  if (bucketed === null) {
    // 超 7 天：回绝对格式（系统时区）
    return formatAbsolute(date, { absolutePattern: "date" });
  }
  return future ? `in ${bucketed}` : `${bucketed} ago`;
}

// ---------------------------------------------------------------------------
// 活渲染时钟
// ---------------------------------------------------------------------------

/** 递增的当前时间戳（默认 30s 一跳）；relative-time 等活渲染组件的统一时钟源 */
export function useNow(intervalMs: number = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (intervalMs <= 0) {
      return;
    }
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}
