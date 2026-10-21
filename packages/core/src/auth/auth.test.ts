import { describe, expect, it } from "vitest";
import {
  type AuthSnapshot,
  filterByCanFn,
  getAuthSnapshot,
  matchPermission,
  notifyUnauthorized,
  requireAuth,
  requireRole,
  waitForAuth,
} from "./index";

/** auth 模块快照无公开 setter：直接改写模块级快照对象（用后还原，resource 层测试同法） */
function setSnapshot(snap: Partial<AuthSnapshot>): void {
  Object.assign(getAuthSnapshot() as object, snap);
}

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

describe("requireAuth / requireRole（路由守卫 redirect）", () => {
  const ctx = {
    location: { href: "/t/acme/services?page=2", pathname: "/t/acme/services" },
  };
  const original: AuthSnapshot = { ...getAuthSnapshot() };

  it("requireAuth：未认证 → redirect /auth/sign-in 并携带 next；已认证 → 放行", async () => {
    setSnapshot({ status: "unauthenticated", user: undefined });
    const denied = await requireAuth()(ctx);
    const redirect = denied as unknown as {
      options: { to: string; search: { next: string } };
    };
    expect(redirect.options.to).toBe("/auth/sign-in");
    expect(redirect.options.search.next).toBe("/t/acme/services?page=2");

    setSnapshot({
      status: "authenticated",
      user: { id: "u1", name: "M", email: "m@x.y" },
    });
    expect(await requireAuth()(ctx)).toBeUndefined();
  });

  it("requireRole：未认证同 requireAuth；角色不匹配（数组/谓词）→ /403；匹配 → 放行", async () => {
    setSnapshot({ status: "unauthenticated", user: undefined });
    const toSignIn = await requireRole(["owner"])(ctx);
    expect((toSignIn as unknown as { options: { to: string } }).options.to).toBe("/auth/sign-in");

    setSnapshot({
      status: "authenticated",
      user: { id: "u1", name: "M", email: "m@x.y", role: "member" },
    });
    const deniedArray = await requireRole(["owner"])(ctx);
    expect((deniedArray as unknown as { options: { to: string } }).options.to).toBe("/403");
    const deniedFn = await requireRole((user) => user.role === "owner")(ctx);
    expect((deniedFn as unknown as { options: { to: string } }).options.to).toBe("/403");

    setSnapshot({
      status: "authenticated",
      user: { id: "u2", name: "O", email: "o@x.y", role: "owner" },
    });
    expect(await requireRole(["owner"])(ctx)).toBeUndefined();
    expect(await requireRole((user) => user.role === "owner")(ctx)).toBeUndefined();
    // fail-closed：user 无 role（undefined）→ 数组形态不放行
    setSnapshot({ status: "authenticated", user: { id: "u3", name: "N", email: "n@x.y" } });
    const noRole = await requireRole(["owner"])(ctx);
    expect((noRole as unknown as { options: { to: string } }).options.to).toBe("/403");

    // 还原全局快照，避免影响其它用例
    setSnapshot(original);
  });
});
