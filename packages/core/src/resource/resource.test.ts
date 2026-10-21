/**
 * core/resource 契约测试（docs/core-api.md §13）。
 * 覆盖：defineResource 默认值与校验、resourceListRouteOptions（validateSearch 形状 + 权限
 * beforeLoad 403）、resourceDetailRouteOptions（loader ensureQueryData key 与 createResource
 * 一致）、inferColumns 类型推断表、inferFormFields（zod 形状 + 样本回落）、
 * navFromResources（分组/排序/canAccess fail-closed）。
 */
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { type AuthSnapshot, getAuthSnapshot } from "../auth";
import type { Page, ResourceClient } from "../data";
import type { SelectFilterDef } from "../filters";
import {
  type AnyResourceDef,
  defineResource,
  inferColumns,
  inferFormFields,
  navFromResources,
  resourceDetailRouteOptions,
  resourceListRouteOptions,
} from "./index";

interface Row {
  id: string;
  name: string;
  email: string;
  active: boolean;
  replicas: number;
  env: "prod" | "dev";
  createdAt: string;
}

const SAMPLE: Row[] = [
  {
    id: "a1b2c3d4-1111-2222-3333-444455556666",
    name: "gateway",
    email: "ops@fleetly.dev",
    active: true,
    replicas: 2,
    env: "prod",
    createdAt: "2026-09-01T08:30:00.000Z",
  },
  {
    id: "b2c3d4e5-1111-2222-3333-444455556666",
    name: "payments",
    email: "fin@fleetly.dev",
    active: false,
    replicas: 5,
    env: "dev",
    createdAt: "2026-09-02T10:00:00.000Z",
  },
];

function makeClient(rows: Row[]): ResourceClient<Row, unknown, unknown> {
  return {
    list: async (): Promise<Page<Row>> => ({ rows, total: rows.length }),
    get: async (id: string) => {
      const row = rows.find((r) => r.id === id);
      if (!row) throw new Error("not found");
      return row;
    },
  };
}

const STATUS_FILTER: SelectFilterDef = {
  field: "env",
  label: "环境",
  kind: "select",
  options: [
    { value: "prod", label: "生产" },
    { value: "dev", label: "开发" },
  ],
};

describe("defineResource", () => {
  it("补默认值：singular（退化复数）/label/tenantScoped", () => {
    const def = defineResource({
      name: "services",
      client: makeClient(SAMPLE),
      columns: [],
    });
    expect(def.singular).toBe("service");
    expect(def.label).toBe("Services");
    expect(def.tenantScoped).toBe(true);
  });

  it("ies → y 复数退化与显式覆盖", () => {
    expect(
      defineResource({ name: "policies", client: makeClient(SAMPLE), columns: [] }).singular,
    ).toBe("policy");
    const explicit = defineResource({
      name: "audit-events",
      singular: "audit event",
      client: makeClient(SAMPLE),
      columns: [],
    });
    expect(explicit.singular).toBe("audit event");
    expect(explicit.label).toBe("Audit-events");
  });

  it("缺 name/client 抛错", () => {
    expect(() => defineResource({ name: "", client: makeClient(SAMPLE), columns: [] })).toThrow();
    expect(() => defineResource({ name: "x", client: {} as never, columns: [] })).toThrow();
  });
});

describe("resourceListRouteOptions", () => {
  it("validateSearch 含 q/filters 字段/sort/page/size；filters 字段进 shape", () => {
    const def = defineResource({
      name: "services",
      client: makeClient(SAMPLE),
      columns: [],
      filters: [STATUS_FILTER],
    });
    const options = resourceListRouteOptions(def);
    const schema = options.validateSearch as unknown as z.ZodObject<Record<string, z.ZodType>>;
    for (const key of ["q", "f", "sort", "page", "size", "env"]) {
      expect(schema.shape[key], `shape.${key}`).toBeDefined();
    }
    expect(schema.shape.nonexistent).toBeUndefined();
    expect(options.staticData.title).toBe("Services");
    expect(options.beforeLoad).toBeUndefined();
  });

  it("parent 子资源参数进 search shape；canAccess 生成 beforeLoad", () => {
    const def = defineResource({
      name: "deployments",
      client: makeClient(SAMPLE),
      columns: [],
      parent: { resource: "services", param: "serviceId" },
      canAccess: (user) => user.role === "owner",
    });
    const options = resourceListRouteOptions(def);
    const schema = options.validateSearch as unknown as z.ZodObject<Record<string, z.ZodType>>;
    expect(schema.shape.serviceId).toBeDefined();
    expect(typeof options.beforeLoad).toBe("function");
  });

  it("canAccess beforeLoad：无权限 → /403 redirect；有权限 → undefined", async () => {
    const original: AuthSnapshot = { ...getAuthSnapshot() };
    // auth 模块快照无公开 setter：直接改写模块级快照对象（用后还原）
    const setSnapshot = (snap: AuthSnapshot) => {
      Object.assign(getAuthSnapshot() as object, snap);
    };
    setSnapshot({
      status: "authenticated",
      user: { id: "u1", name: "M", email: "m@x.y", role: "member" },
    });
    const def = defineResource({
      name: "billing",
      client: makeClient(SAMPLE),
      columns: [],
      canAccess: (user) => user.role === "owner",
    });
    const guard = resourceListRouteOptions(def).beforeLoad;
    expect(guard).toBeDefined();
    const denied = await guard?.({
      location: { href: "/t/acme/billing", pathname: "/t/acme/billing" },
    });
    // redirect() 在本路由版本返回 Response（307），目标在 .options.to
    expect((denied as unknown as { options: { to: string } }).options.to).toBe("/403");

    setSnapshot({
      status: "authenticated",
      user: { id: "u2", name: "O", email: "o@x.y", role: "owner" },
    });
    const allowed = await guard?.({
      location: { href: "/t/acme/billing", pathname: "/t/acme/billing" },
    });
    expect(allowed).toBeUndefined();
    // 还原全局快照，避免影响其它用例
    setSnapshot(original);
  });
});

describe("resourceDetailRouteOptions", () => {
  it("loader 经 ensureQueryData 预取，queryKey 与 createResource 约定一致", async () => {
    const queryClient = new QueryClient();
    const seen: { key: unknown[]; fn?: unknown }[] = [];
    const qc = {
      ensureQueryData: async (opts: { queryKey: unknown[]; queryFn: () => Promise<unknown> }) => {
        seen.push({ key: opts.queryKey });
        return opts.queryFn();
      },
    };
    const def = defineResource({ name: "services", client: makeClient(SAMPLE), columns: [] });
    const options = resourceDetailRouteOptions(def);
    expect(options.staticData.title).toBe("service");
    const firstId = SAMPLE[0]?.id ?? "";
    await options.loader?.({
      context: { queryClient: qc },
      params: { id: firstId, tenantId: "acme-web" },
    });
    expect(seen[0]?.key).toEqual(["services", "acme-web", "detail", firstId]);

    // tenantScoped=false → key 不含租户段
    const globalDef = defineResource({
      name: "users",
      client: makeClient(SAMPLE),
      columns: [],
      tenantScoped: false,
    });
    const secondId = SAMPLE[1]?.id ?? "";
    await resourceDetailRouteOptions(globalDef).loader?.({
      context: { queryClient: qc },
      params: { id: secondId },
    });
    expect(seen[1]?.key).toEqual(["users", "detail", secondId]);
    void queryClient;
  });

  it("缺 queryClient / id → 不预取（容错）", async () => {
    const def = defineResource({ name: "services", client: makeClient(SAMPLE), columns: [] });
    const options = resourceDetailRouteOptions(def);
    await expect(options.loader?.({ context: {}, params: { id: "x" } })).resolves.toBeUndefined();
    await expect(
      options.loader?.({ context: { queryClient: {} }, params: {} }),
    ).resolves.toBeUndefined();
  });
});

describe("inferColumns", () => {
  it("类型推断表：uuid→id、ISO 日期→time、email→user、boolean、number、distinct≤12→enum", () => {
    const { columns, report } = inferColumns(SAMPLE as unknown as Record<string, unknown>[]);
    const meta = (id: string) => columns.find((c) => c.id === id)?.meta;
    expect(meta("id")?.cell).toBe("id");
    expect(meta("createdAt")?.cell).toBe("time");
    expect(meta("email")?.cell).toBe("user");
    expect(meta("active")?.cell).toBe("boolean");
    expect(meta("replicas")?.cell).toBe("number");
    expect(meta("env")?.cell).toBe("enum");
    expect(meta("env")?.enumValues).toEqual(["dev", "prod"]);
    expect(meta("name")?.cell).toBe("text");
    // report 是可粘贴代码字符串
    expect(report).toContain('helper.accessor("createdAt"');
    expect(report).toContain('"time"');
    expect(columns.every((c) => c.id === (c as { accessorKey?: string }).accessorKey)).toBe(true);
  });

  it("version 等内部字段跳过；空样本给出提示", () => {
    const withVersion = SAMPLE.map((r) => ({ ...r, version: 3 }));
    const { columns } = inferColumns(withVersion as unknown as Record<string, unknown>[]);
    expect(columns.find((c) => c.id === "version")).toBeUndefined();
    const empty = inferColumns([]);
    expect(empty.columns).toEqual([]);
    expect(empty.report).toContain("空样本");
  });

  it("enum 超限（distinct > 12）回落 text", () => {
    const rows = Array.from({ length: 20 }, (_, i) => ({ name: `svc-${i}` }));
    const { columns } = inferColumns(rows);
    expect(columns[0]?.meta?.cell).toBe("text");
  });

  it("distinct 边界：恰好 12 仍为 enum，13 回落 text；skipFields 排除指定字段", () => {
    // 13 行但只有 12 个 distinct（e12 与 e0 相同）→ enum
    const rows12 = Array.from({ length: 13 }, (_, i) => ({
      env: `e${i % 12}`,
      internal: `secret-${i}`,
    }));
    const r12 = inferColumns(rows12, { skipFields: ["internal"] });
    expect(r12.columns.find((c) => c.id === "internal")).toBeUndefined();
    expect(r12.columns.find((c) => c.id === "env")?.meta?.cell).toBe("enum");
    expect(r12.columns.find((c) => c.id === "env")?.meta?.enumValues).toHaveLength(12);
    // 13 个 distinct → text
    const rows13 = Array.from({ length: 13 }, (_, i) => ({ env: `e${i}` }));
    expect(inferColumns(rows13).columns[0]?.meta?.cell).toBe("text");
  });
});

describe("inferFormFields", () => {
  it("zod 形状 → widget 映射（email/number/boolean/enum/array/record/date）", () => {
    const schema = z.object({
      name: z.string().min(2),
      email: z.email(),
      replicas: z.number().int().min(1),
      active: z.boolean(),
      env: z.enum(["prod", "dev"]),
      regions: z.array(z.enum(["cn", "us"])),
      envOverrides: z.record(z.string(), z.string()),
      createdAt: z.string().datetime(),
      owner: z.string().optional(),
    });
    const { fields } = inferFormFields(schema);
    const byName = new Map(fields.map((f) => [f.name, f]));
    expect(byName.get("name")?.widget).toBe("text");
    expect(byName.get("email")?.widget).toBe("text");
    expect(byName.get("replicas")?.widget).toBe("number");
    expect(byName.get("active")?.widget).toBe("switch");
    expect(byName.get("env")?.widget).toBe("select");
    expect(byName.get("env")?.options).toEqual([
      { value: "prod", label: "prod" },
      { value: "dev", label: "dev" },
    ]);
    expect(byName.get("regions")?.widget).toBe("multi-select");
    expect(byName.get("envOverrides")?.widget).toBe("kv-pairs");
    expect(byName.get("createdAt")?.widget).toBe("date");
    expect(byName.get("owner")?.widget).toBe("text"); // optional 解包
  });

  it("样本行数组回落类型推断；description 类字段 → textarea", () => {
    const rows = [
      { env: "prod", replicas: 1, active: true, description: "x" },
      { env: "dev", replicas: 2, active: false, description: "y" },
    ];
    const { fields, report } = inferFormFields(rows);
    const byName = new Map(fields.map((f) => [f.name, f]));
    expect(byName.get("env")?.widget).toBe("select");
    expect(byName.get("replicas")?.widget).toBe("number");
    expect(byName.get("active")?.widget).toBe("switch");
    expect(byName.get("description")?.widget).toBe("textarea");
    expect(report).toContain("fields = [");
  });
});

describe("navFromResources", () => {
  const defs: AnyResourceDef[] = [
    defineResource({
      name: "services",
      client: makeClient(SAMPLE),
      columns: [],
      nav: { group: "Build", icon: "boxes", order: 10 },
    }),
    defineResource({
      name: "audit-events",
      client: makeClient(SAMPLE),
      columns: [],
      nav: { group: "Data", order: 20 },
    }),
    defineResource({
      name: "deployments",
      client: makeClient(SAMPLE),
      columns: [],
      nav: { group: "Build", order: 5 },
    }),
    { name: "hidden", client: makeClient(SAMPLE), columns: [] }, // 无 nav：不进导航
    defineResource({
      name: "billing",
      client: makeClient(SAMPLE),
      columns: [],
      nav: { group: "Manage" },
      canAccess: (user) => user.role === "owner",
    }),
  ];

  it("按 group 分组、order 组内排序、组间按最小 order", () => {
    const groups = navFromResources(defs, {
      id: "u",
      name: "n",
      email: "e",
      role: "owner",
    });
    expect(groups.map((g) => g.group)).toEqual(["Build", "Data", "Manage"]);
    expect(groups[0]?.items.map((i) => i.name)).toEqual(["deployments", "services"]);
    expect(groups[0]?.items[0]?.to).toBe("/deployments");
    expect(groups[0]?.items.find((i) => i.name === "services")?.icon).toBe("boxes");
  });

  it("canAccess fail-closed：user 缺失或无权限 → 隐藏", () => {
    const noUser = navFromResources(defs);
    expect(noUser.map((g) => g.group)).toEqual(["Build", "Data"]);
    const member = navFromResources(defs, {
      id: "u",
      name: "n",
      email: "e",
      role: "member",
    });
    expect(member.map((g) => g.group)).toEqual(["Build", "Data"]);
  });
});
