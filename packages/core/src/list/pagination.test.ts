/**
 * 分页协议契约节点单测（M7-A2，docs/core-api.md §3.1）：
 * page/offset/keyset 封闭词表 ↔ ListMode 映射、legacy 双轨、offset 引擎未实现
 * 显式 throw、能力派生（canJump/hasTotal/tokenInMemory）。
 */
import { describe, expect, it } from "vitest";
import {
  type DefListShape,
  PAGINATION_MODES,
  paginationCapabilitiesOf,
  resolveListPagination,
} from "./index";

describe("PAGINATION_MODES（封闭词表三值齐备）", () => {
  it("page / offset / keyset", () => {
    expect([...PAGINATION_MODES]).toEqual(["page", "offset", "keyset"]);
  });
});

describe("resolveListPagination（映射定案）", () => {
  it("page → server-offset", () => {
    expect(resolveListPagination({ pagination: { mode: "page" } })).toEqual({
      mode: "server-offset",
      protocol: "page",
    });
  });

  it("keyset 缺省 shape → server-cursor；load-more 档 → load-more", () => {
    expect(resolveListPagination({ pagination: { mode: "keyset" } })).toEqual({
      mode: "server-cursor",
      protocol: "keyset",
    });
    expect(resolveListPagination({ pagination: { mode: "keyset", shape: "paged" } })).toEqual({
      mode: "server-cursor",
      protocol: "keyset",
    });
    expect(resolveListPagination({ pagination: { mode: "keyset", shape: "load-more" } })).toEqual({
      mode: "load-more",
      protocol: "keyset",
    });
  });

  it("失败路径：offset 类型层合法但引擎未实现 → 显式 throw（含合法实现值）", () => {
    expect(() => resolveListPagination({ pagination: { mode: "offset" } })).toThrow(
      /offset 未实现.*page\/keyset.*词表三值 page\/offset\/keyset/s,
    );
  });

  it("legacy 双轨：server-offset→page、server-cursor/load-more→keyset、client 正交（protocol 空）", () => {
    expect(resolveListPagination({ mode: "server-offset" })).toEqual({
      mode: "server-offset",
      protocol: "page",
    });
    expect(resolveListPagination({ mode: "server-cursor" })).toEqual({
      mode: "server-cursor",
      protocol: "keyset",
    });
    expect(resolveListPagination({ mode: "load-more" })).toEqual({
      mode: "load-more",
      protocol: "keyset",
    });
    expect(resolveListPagination({ mode: "client" })).toEqual({
      mode: "client",
      protocol: undefined,
    });
  });

  it("缺省 → page（server-offset）", () => {
    expect(resolveListPagination(undefined)).toEqual({ mode: "server-offset", protocol: "page" });
    // def.list 只带 pageSize/facets（无分页声明）同样回落缺省协议
    const pageSizeOnly: DefListShape & { pageSize: number } = { pageSize: 30 };
    expect(resolveListPagination(pageSizeOnly)).toEqual({
      mode: "server-offset",
      protocol: "page",
    });
  });

  it("失败路径：新节点与 legacy mode 冲突 → throw（双轨期防混写）", () => {
    expect(() =>
      resolveListPagination({ pagination: { mode: "page" }, mode: "server-cursor" }),
    ).toThrow(/冲突.*双轨期只声明其一/);
    // 映射等价的声明不冲突
    expect(resolveListPagination({ pagination: { mode: "page" }, mode: "server-offset" })).toEqual({
      mode: "server-offset",
      protocol: "page",
    });
  });
});

describe("paginationCapabilitiesOf（能力派生，非 mode 直通 UI）", () => {
  it("client / server-offset：可跳页、有总数、token 不留内存", () => {
    expect(paginationCapabilitiesOf("client")).toEqual({
      canJump: true,
      hasTotal: true,
      tokenInMemory: false,
    });
    expect(paginationCapabilitiesOf("server-offset")).toEqual({
      canJump: true,
      hasTotal: true,
      tokenInMemory: false,
    });
  });

  it("keyset 家族：无 canJump（禁页码窗口）、无总数、token 留内存", () => {
    expect(paginationCapabilitiesOf("server-cursor")).toEqual({
      canJump: false,
      hasTotal: false,
      tokenInMemory: true,
    });
    expect(paginationCapabilitiesOf("load-more")).toEqual({
      canJump: false,
      hasTotal: false,
      tokenInMemory: true,
    });
  });
});
