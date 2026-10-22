/**
 * parseError 单测（M7-A2，docs/core-api.md §1.2.1）：错误信封协议集归一——
 * problem+json / {code,message} / 裸状态码 / 字段错误对象·数组 / 网络 / 未知；
 * 422/400 必回填 fieldErrors（不变量）。
 */
import { describe, expect, it } from "vitest";
import { HttpError, parseError } from "./index";

describe("parseError（错误信封单源）", () => {
  it("裸状态码：HttpError 无 body", () => {
    const parsed = parseError(new HttpError(503, "upstream down"));
    expect(parsed).toMatchObject({ kind: "server", status: 503, message: "upstream down" });
  });

  it("problem+json：detail ?? title 回落", () => {
    const withDetail = parseError(
      new HttpError(400, "fallback", {
        type: "https://example.com/errors/invalid",
        title: "请求无效",
        detail: "分页参数越界",
      }),
    );
    expect(withDetail.message).toBe("分页参数越界");
    const titleOnly = parseError(new HttpError(404, "fallback", { title: "未找到" }));
    expect(titleOnly).toMatchObject({ kind: "not-found", status: 404, message: "未找到" });
  });

  it("{code,message} 信封", () => {
    const parsed = parseError(
      new HttpError(409, "fallback", { code: "version_conflict", message: "版本冲突" }),
    );
    expect(parsed).toMatchObject({ kind: "conflict", status: 409, message: "版本冲突" });
  });

  it("字段错误对象：422 必回填 fieldErrors（非 string 值 String()）", () => {
    const parsed = parseError(
      new HttpError(422, "提交失败", { fields: { name: "名称已被占用", count: 3 } }),
    );
    expect(parsed.fieldErrors).toEqual({ name: "名称已被占用", count: "3" });
  });

  it("字段错误数组：{field|path, message} 双命名兼容", () => {
    const parsed = parseError(
      new HttpError(422, "提交失败", {
        errors: [
          { field: "email", message: "邮箱格式无效" },
          { path: "profile.name", message: "必填" },
          { message: "无字段名（跳过）" },
        ],
      }),
    );
    expect(parsed.fieldErrors).toEqual({ email: "邮箱格式无效", "profile.name": "必填" });
  });

  it("problem+json errors 数组也回填字段错误", () => {
    const parsed = parseError(
      new HttpError(422, "fallback", {
        title: "校验失败",
        errors: [{ path: "name", detail: "过短" }],
      }),
    );
    expect(parsed.message).toBe("校验失败");
    expect(parsed.fieldErrors).toEqual({ name: "过短" });
  });

  it("422 无字段错误信封 → fieldErrors 空对象（必回填不变量）", () => {
    const parsed = parseError(new HttpError(422, "plain"));
    expect(parsed.fieldErrors).toEqual({});
  });

  it("非 422/400：无字段错误不回填；携带字段错误则保真回填（422 是必回填不变量）", () => {
    expect(parseError(new HttpError(500, "boom")).fieldErrors).toBeUndefined();
    expect(parseError(new HttpError(404, "x", { fields: { a: "b" } })).fieldErrors).toEqual({
      a: "b",
    });
  });

  it("结构兼容 {status} 对象（duck-typing）：kind 按 status 映射", () => {
    const parsed = parseError({ status: 403 });
    expect(parsed).toMatchObject({ kind: "forbidden", status: 403, message: "" });
    const server = parseError({ status: 502, message: "bad gateway" });
    expect(server).toMatchObject({ kind: "server", status: 502, message: "bad gateway" });
  });

  it("网络失败：TypeError → network", () => {
    const parsed = parseError(new TypeError("Failed to fetch"));
    expect(parsed).toMatchObject({ kind: "network", message: "Failed to fetch" });
    expect(parsed.status).toBeUndefined();
  });

  it("未知：普通 Error 保留 message；非 Error → 空消息", () => {
    expect(parseError(new Error("boom"))).toMatchObject({ kind: "unknown", message: "boom" });
    expect(parseError("str")).toMatchObject({ kind: "unknown", message: "" });
    expect(parseError(undefined)).toMatchObject({ kind: "unknown" });
  });
});
