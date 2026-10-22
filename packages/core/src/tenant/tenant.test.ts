import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getRememberedTenant,
  rememberTenant,
  replaceTenantPrefix,
  rootTenantRedirect,
  TENANT_STORAGE_KEY,
} from "./index";

function stubLocalStorage(): void {
  const map = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    clear: () => map.clear(),
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("replaceTenantPrefix", () => {
  it("replaces the /t/:id prefix and keeps the rest of the path", () => {
    expect(replaceTenantPrefix("/t/acme-web/services", "torchwood")).toBe("/t/torchwood/services");
  });

  it("works at the tenant root", () => {
    expect(replaceTenantPrefix("/t/acme-web", "torchwood")).toBe("/t/torchwood");
  });

  it("works with trailing slash", () => {
    expect(replaceTenantPrefix("/t/acme-web/settings/", "torchwood")).toBe(
      "/t/torchwood/settings/",
    );
  });

  it("falls back to the tenant root when no /t/:id prefix exists", () => {
    expect(replaceTenantPrefix("/", "torchwood")).toBe("/t/torchwood");
    expect(replaceTenantPrefix("/auth/sign-in", "torchwood")).toBe("/t/torchwood");
  });
});

describe("rememberTenant / getRememberedTenant", () => {
  it("round-trips through localStorage（createStorage 信封格式，M6-B）", () => {
    stubLocalStorage();
    expect(getRememberedTenant()).toBeNull();
    rememberTenant("acme-web");
    expect(getRememberedTenant()).toBe("acme-web");
    expect(JSON.parse(localStorage.getItem(TENANT_STORAGE_KEY) ?? "{}")).toEqual({
      v: 1,
      d: "acme-web",
    });
  });

  it("旧格式（信封前裸字符串）无感迁移", () => {
    stubLocalStorage();
    localStorage.setItem(TENANT_STORAGE_KEY, "torchwood");
    expect(getRememberedTenant()).toBe("torchwood");
  });

  it("tolerates a missing localStorage (no browser)", () => {
    expect(() => rememberTenant("acme-web")).not.toThrow();
    expect(getRememberedTenant()).toBeNull();
  });
});

describe("rootTenantRedirect", () => {
  const tenants = [
    { id: "acme-web", name: "Acme Web" },
    { id: "torchwood", name: "Torchwood" },
  ];

  it("redirects to the remembered tenant when it is still valid", () => {
    stubLocalStorage();
    rememberTenant("torchwood");
    expect(rootTenantRedirect({ tenants })).toBe("/t/torchwood");
  });

  it("falls back to the first tenant when the remembered id is stale", () => {
    stubLocalStorage();
    rememberTenant("deleted-org");
    expect(rootTenantRedirect({ tenants })).toBe("/t/acme-web");
  });

  it("falls back to the first tenant when nothing is remembered", () => {
    expect(rootTenantRedirect({ tenants })).toBe("/t/acme-web");
  });

  it("returns /t/_none when there are no tenants (host renders empty state)", () => {
    expect(rootTenantRedirect({ tenants: [] })).toBe("/t/_none");
  });
});
