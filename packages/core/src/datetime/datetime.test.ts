import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DATETIME_STORAGE_KEY,
  formatAbsolute,
  formatRelative,
  primeDateTimePrefs,
  writeDateTimePrefs,
} from "./index";

afterEach(() => {
  vi.unstubAllGlobals();
});

const NOW = Date.UTC(2026, 0, 15, 12, 0, 0); // 2026-01-15T12:00:00Z

describe("formatRelative", () => {
  it("returns 'just now' within 10 seconds (past or future)", () => {
    expect(formatRelative(NOW - 5_000, NOW)).toBe("just now");
    expect(formatRelative(NOW + 5_000, NOW)).toBe("just now");
  });

  it("buckets to s / m / h / d", () => {
    expect(formatRelative(NOW - 45_000, NOW)).toBe("45s ago");
    expect(formatRelative(NOW - 5 * 60_000, NOW)).toBe("5m ago");
    expect(formatRelative(NOW - 2 * 3_600_000, NOW)).toBe("2h ago");
    expect(formatRelative(NOW - 3 * 86_400_000, NOW)).toBe("3d ago");
  });

  it("uses 'in X' for future timestamps", () => {
    expect(formatRelative(NOW + 2 * 3_600_000, NOW)).toBe("in 2h");
  });

  it("falls back to an absolute date beyond 7 days", () => {
    const iso = "2025-12-01T00:00:00Z";
    const expected = formatAbsolute(new Date(iso), { absolutePattern: "date" });
    expect(formatRelative(iso, NOW)).toBe(expected);
  });

  it("passes invalid values through as strings", () => {
    expect(formatRelative("not-a-date", NOW)).toBe("not-a-date");
  });
});

describe("formatAbsolute", () => {
  it("formats in the preferred timezone", () => {
    const instant = "2026-01-15T12:00:00Z";
    const tokyo = formatAbsolute(instant, { timeZone: "Asia/Tokyo", absolutePattern: "datetime" });
    expect(tokyo).toContain("21:00"); // UTC+9
    const la = formatAbsolute(instant, {
      timeZone: "America/Los_Angeles",
      absolutePattern: "datetime",
    });
    expect(la).toContain("04:00"); // UTC-8
  });

  it("respects hour12 preference", () => {
    const instant = "2026-01-15T13:30:00Z";
    const h24 = formatAbsolute(instant, {
      timeZone: "UTC",
      hour12: false,
      absolutePattern: "datetime",
    });
    expect(h24).toContain("13:30");
    const h12 = formatAbsolute(instant, {
      timeZone: "UTC",
      hour12: true,
      absolutePattern: "datetime",
    });
    // locale 无关断言：12 小时制不含 24 制字符串，且仍含分钟段
    expect(h12).not.toBe(h24);
    expect(h12).toContain("30");
    expect(
      new Intl.DateTimeFormat(undefined, {
        hour12: true,
        timeZone: "UTC",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(instant)),
    ).toBe(h12);
  });

  it("date pattern omits the time", () => {
    const out = formatAbsolute("2026-01-15T12:00:00Z", {
      timeZone: "UTC",
      absolutePattern: "date",
    });
    expect(out).not.toMatch(/\d{1,2}:\d{2}/);
    expect(out).toMatch(/2026/);
  });

  it("handles DST boundaries via Intl (America/New_York summer)", () => {
    // 2026-07-15 处于夏令时（UTC-4）
    expect(
      formatAbsolute("2026-07-15T12:00:00Z", {
        timeZone: "America/New_York",
        absolutePattern: "datetime",
      }),
    ).toContain("08:00");
    // 2026-01-15 处于标准时间（UTC-5）
    expect(
      formatAbsolute("2026-01-15T12:00:00Z", {
        timeZone: "America/New_York",
        absolutePattern: "datetime",
      }),
    ).toContain("07:00");
  });

  it("passes invalid values through as strings", () => {
    expect(formatAbsolute("nope", {})).toBe("nope");
  });
});

describe("prefs persistence", () => {
  it("merges and persists prefs; prime restores them", () => {
    const map = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
      clear: () => map.clear(),
    });
    writeDateTimePrefs({ timeZone: "Asia/Tokyo" });
    writeDateTimePrefs({ hour12: true }); // 合并而非覆盖
    expect(map.get(DATETIME_STORAGE_KEY)).toBe(
      JSON.stringify({ timeZone: "Asia/Tokyo", hour12: true }),
    );

    // 模拟新页面加载：重新 prime 后偏好恢复
    map.set(DATETIME_STORAGE_KEY, JSON.stringify({ timeZone: "Europe/Berlin" }));
    primeDateTimePrefs();
    expect(formatAbsolute("2026-01-15T12:00:00Z", { absolutePattern: "datetime" })).not.toContain(
      "21:00", // 若仍是 Tokyo 会是 21:00；Berlin 应为 13:00
    );
  });

  it("prime tolerates corrupted JSON", () => {
    const map = new Map<string, string>([[DATETIME_STORAGE_KEY, "{invalid"]]);
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      removeItem: (k: string) => void map.delete(k),
      clear: () => map.clear(),
    });
    expect(() => primeDateTimePrefs()).not.toThrow();
    expect(
      formatAbsolute("2026-01-15T12:00:00Z", { timeZone: "UTC", absolutePattern: "datetime" }),
    ).toContain("12:00");
  });
});
