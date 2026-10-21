import { describe, expect, it } from "vitest";
import {
  filterByCanFn,
  getAuthSnapshot,
  matchPermission,
  notifyUnauthorized,
  waitForAuth,
} from "./index";

describe("matchPermission (fail-closed)", () => {
  it("denies everything when permissions are missing or empty", () => {
    expect(matchPermission(undefined, "read")).toBe(false);
    expect(matchPermission([], "read")).toBe(false);
    expect(matchPermission(undefined, "read", "services")).toBe(false);
  });

  it("wildcard grants everything", () => {
    expect(matchPermission(["*"], "read")).toBe(true);
    expect(matchPermission(["*"], "write", "services")).toBe(true);
  });

  it("matches resource.action and resource:*", () => {
    const permissions = ["services.read", "deployments:*"];
    expect(matchPermission(permissions, "read", "services")).toBe(true);
    expect(matchPermission(permissions, "write", "services")).toBe(false);
    expect(matchPermission(permissions, "create", "deployments")).toBe(true);
    expect(matchPermission(permissions, "read", "audit")).toBe(false);
  });

  it("matches bare action when no resource is given", () => {
    expect(matchPermission(["billing:view"], "billing:view")).toBe(true);
    expect(matchPermission(["billing:view"], "billing:edit")).toBe(false);
  });
});

describe("filterByCanFn", () => {
  const can = (action: string) => action === "read";
  const items = [
    { to: "/a", label: "A" }, // no canAccess → visible
    { to: "/b", label: "B", canAccess: (c: (a: string) => boolean) => c("read") },
    { to: "/c", label: "C", canAccess: (c: (a: string) => boolean) => c("write") },
  ];

  it("keeps unrestricted items and items passing canAccess", () => {
    expect(filterByCanFn(items, can)).toEqual([items[0], items[1]]);
  });
});

describe("auth snapshot", () => {
  it("notifyUnauthorized flips a settled snapshot to unauthenticated", async () => {
    // 初始（模块加载后未经 Provider）应为 loading；等待者挂起
    expect(getAuthSnapshot().status).toBe("loading");
    let resolved: unknown = "pending";
    void waitForAuth().then((s) => {
      resolved = s.status;
    });
    notifyUnauthorized();
    expect(getAuthSnapshot().status).toBe("unauthenticated");
    await Promise.resolve();
    expect(resolved).toBe("unauthenticated");
  });

  it("waitForAuth resolves immediately once settled", async () => {
    const snapshot = await waitForAuth();
    expect(snapshot.status).toBe("unauthenticated");
  });
});
