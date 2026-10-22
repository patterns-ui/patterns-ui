/**
 * createStorage 契约测试（docs/paradigm.md §5-B）：
 * 信封格式 / zod 校验 / 版本迁移（含信封前裸格式 version 0）/ 租户段拼装 / 非浏览器降级。
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createStorage } from "./index";

function stubLocalStorage(): Map<string, string> {
  const map = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  });
  return map;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

const prefsSchema = z.object({ timeZone: z.string().optional(), hour12: z.boolean().optional() });
const stringSchema = z.string();
const enumSchema = z.enum(["relative", "absolute"]);

describe("createStorage", () => {
  it("写读往返：信封 {v, d} 格式 + schema 校验", () => {
    const map = stubLocalStorage();
    const storage = createStorage("fc:x", prefsSchema);
    expect(storage.read()).toBeUndefined();
    storage.write({ timeZone: "Asia/Tokyo" });
    expect(JSON.parse(map.get("fc:x") ?? "{}")).toEqual({ v: 1, d: { timeZone: "Asia/Tokyo" } });
    expect(storage.read()).toEqual({ timeZone: "Asia/Tokyo" });
  });

  it("坏值（schema 不过 / 损坏 JSON）→ undefined 且不抛错", () => {
    const map = stubLocalStorage();
    const storage = createStorage("fc:x", enumSchema);
    map.set("fc:x", JSON.stringify({ v: 1, d: "nonsense" }));
    expect(storage.read()).toBeUndefined();
    map.set("fc:x", "{invalid");
    expect(storage.read()).toBeUndefined();
    map.set("fc:x", JSON.stringify({ v: 1, d: "absolute" }));
    expect(storage.read()).toBe("absolute");
  });

  it("remove 删除存储项", () => {
    stubLocalStorage();
    const storage = createStorage("fc:x", stringSchema);
    storage.write("a");
    storage.remove();
    expect(storage.read()).toBeUndefined();
  });
});

describe("旧数据迁移（version + migrate）", () => {
  it("信封前裸 JSON（version 0）经 migrate 升级", () => {
    const map = stubLocalStorage();
    const storage = createStorage("fc:prefs", prefsSchema, {
      migrate: (raw) => raw,
    });
    map.set("fc:prefs", JSON.stringify({ timeZone: "Europe/Berlin", extra: 1 }));
    expect(storage.read()).toEqual({ timeZone: "Europe/Berlin" }); // 超集键被 schema 剥离
  });

  it("信封前裸字符串（非 JSON）经 migrate 升级", () => {
    const map = stubLocalStorage();
    const storage = createStorage("fc:last", stringSchema, {
      migrate: (raw) => raw,
    });
    map.set("fc:last", "acme-web"); // 旧格式：不经 JSON 序列化的裸串
    expect(storage.read()).toBe("acme-web");
  });

  it("旧信封（v < version）经 migrate；migrate 结果仍须过 schema", () => {
    const map = stubLocalStorage();
    const storage = createStorage("fc:prefs", prefsSchema, {
      version: 2,
      migrate: (raw, ctx) =>
        ctx.fromVersion === 1 ? { ...(raw as Record<string, unknown>), hour12: true } : raw,
    });
    map.set("fc:prefs", JSON.stringify({ v: 1, d: { timeZone: "UTC" } }));
    expect(storage.read()).toEqual({ timeZone: "UTC", hour12: true });
    // migrate 产物 schema 不过（timeZone 非字符串）→ 弃用
    map.set("fc:prefs", JSON.stringify({ v: 1, d: { timeZone: 123 } }));
    expect(storage.read()).toBeUndefined();
  });

  it("无 migrate 时旧格式显式弃用（version 0 / 旧信封）", () => {
    const map = stubLocalStorage();
    const storage = createStorage("fc:prefs", prefsSchema);
    map.set("fc:prefs", JSON.stringify({ timeZone: "UTC" }));
    expect(storage.read()).toBeUndefined();
  });

  it("未来版本（v > version，降级运行）弃用", () => {
    const map = stubLocalStorage();
    const storage = createStorage("fc:prefs", prefsSchema, { version: 1 });
    map.set("fc:prefs", JSON.stringify({ v: 99, d: { timeZone: "UTC" } }));
    expect(storage.read()).toBeUndefined();
  });
});

describe("租户段拼装（tenant-scoped key）", () => {
  it("tenantId → 最终 key 追加 ':<tenantId>' 段；缺省不拼段", () => {
    stubLocalStorage();
    const scoped = createStorage("fc:prefs", stringSchema, { tenantId: "acme" });
    const global = createStorage("fc:prefs", stringSchema);
    expect(scoped.fullKey).toBe("fc:prefs:acme");
    expect(global.fullKey).toBe("fc:prefs");
    scoped.write("t1");
    global.write("t2");
    expect(scoped.read()).toBe("t1");
    expect(global.read()).toBe("t2");
  });
});

describe("非浏览器环境降级", () => {
  it("无 localStorage：read → undefined，write/remove 不抛错", () => {
    const storage = createStorage("fc:x", stringSchema);
    expect(storage.read()).toBeUndefined();
    expect(() => storage.write("a")).not.toThrow();
    expect(() => storage.remove()).not.toThrow();
  });
});
