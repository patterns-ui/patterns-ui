/**
 * core/datetime —— 时间单源（docs/core-api.md §11）。
 *
 * 偏好（时区/hour12/绝对格式）存 localStorage 'fc:datetime'（偏好语义，不进 URL）；
 * 默认时区 = 系统时区（prefs.timeZone 缺省时 Intl 自行解析）。
 * Intl.DateTimeFormat 按 (tz, opts) 键缓存；DST 由 Intl 正确处理。
 */
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useMounted } from "../mounted";

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
// localStorage 读写全部 try/catch 收敛；首次读取发生在 effect（prime）内。
// ---------------------------------------------------------------------------

let prefsCache: DateTimePrefs = EMPTY_PREFS;
let primed = false;
const listeners = new Set<() => void>();

function localStorageRef(): Storage | undefined {
  try {
    return globalThis.localStorage;
  } catch {
    return undefined;
  }
}

function emit(): void {
  for (const listener of listeners) listener();
}

/** 从 localStorage 恢复偏好（幂等；useDateTimePrefs 挂载时调用） */
export function primeDateTimePrefs(): void {
  if (primed) {
    return;
  }
  primed = true;
  try {
    const raw = localStorageRef()?.getItem(DATETIME_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as DateTimePrefs;
      if (parsed && typeof parsed === "object") {
        prefsCache = parsed;
        emit();
      }
    }
  } catch {
    /* 坏值静默忽略，保持默认 */
  }
}

/** 直接写入偏好（合并语义）并持久化；事件/effect 内调用 */
export function writeDateTimePrefs(patch: Partial<DateTimePrefs>): void {
  prefsCache = { ...prefsCache, ...patch };
  try {
    localStorageRef()?.setItem(DATETIME_STORAGE_KEY, JSON.stringify(prefsCache));
  } catch {
    /* 非浏览器环境 / 隐私模式：内存态仍生效 */
  }
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
