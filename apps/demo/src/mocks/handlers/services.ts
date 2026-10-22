import { randomUUID } from "node:crypto";
import { type FilterTree, isFilterLeaf, isFilterNode } from "@fleetly/ui-component-core/filters";
import { findUserByToken, type MockService, servicesOf } from "../db";
import { fail, type MockRequestContext, type MockRoute, ok } from "../types";

function bearerToken(req: { headers: { authorization?: string } }): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}

function requireUser(req: MockRequestContext["req"]): boolean {
  return findUserByToken(bearerToken(req)) !== undefined;
}

/** 错误触发：header x-demo-error（401|403|500）或搜索词 boom */
function demoErrorGate(ctx: MockRequestContext): ReturnType<typeof fail> | undefined {
  const header = ctx.req.headers["x-demo-error"];
  const forced = Array.isArray(header) ? header[0] : header;
  if (forced === "401" || forced === "403" || forced === "500") {
    const messages: Record<string, string> = {
      "401": "未登录或登录已过期（x-demo-error 触发）",
      "403": "没有权限执行此操作（x-demo-error 触发）",
      "500": "模拟服务端错误（x-demo-error 触发）",
    };
    return fail(Number(forced), messages[forced] ?? "模拟错误");
  }
  const q = ctx.query.get("q");
  if (q?.toLowerCase().includes("boom")) {
    return fail(500, "搜索词包含 boom：模拟服务端错误");
  }
  return undefined;
}

export function evaluateTree(row: Record<string, unknown>, tree: FilterTree | undefined): boolean {
  if (tree === undefined) return true;
  if (isFilterNode(tree)) {
    return tree.combinator === "or"
      ? tree.children.some((c) => evaluateTree(row, c))
      : tree.children.every((c) => evaluateTree(row, c));
  }
  if (isFilterLeaf(tree)) {
    const actual = row[tree.field];
    const expected = tree.value;
    switch (tree.op) {
      case "eq":
        return actual === expected || String(actual) === String(expected);
      case "ne":
        return !(actual === expected || String(actual) === String(expected));
      case "in":
        return Array.isArray(expected) && expected.some((v) => String(v) === String(actual));
      case "nin":
        return !(Array.isArray(expected) && expected.some((v) => String(v) === String(actual)));
      case "contains": {
        if (actual === undefined || actual === null) return false;
        if (Array.isArray(actual)) {
          return actual.some((v) =>
            String(v).toLowerCase().includes(String(expected).toLowerCase()),
          );
        }
        return String(actual).toLowerCase().includes(String(expected).toLowerCase());
      }
      case "gt":
      case "gte":
      case "lt":
      case "lte": {
        const a = typeof actual === "number" ? actual : Date.parse(String(actual));
        const b = typeof expected === "number" ? expected : Date.parse(String(expected));
        if (Number.isNaN(a) || Number.isNaN(b)) return false;
        if (tree.op === "gt") return a > b;
        if (tree.op === "gte") return a >= b;
        if (tree.op === "lt") return a < b;
        return a <= b;
      }
      case "between": {
        const pair = Array.isArray(expected) ? expected : [];
        const a = typeof actual === "number" ? actual : Date.parse(String(actual));
        const loRaw = pair[0];
        const hiRaw = pair[1];
        const lo =
          typeof loRaw === "number"
            ? loRaw
            : loRaw !== undefined
              ? Date.parse(String(loRaw))
              : undefined;
        const hi =
          typeof hiRaw === "number"
            ? hiRaw
            : hiRaw !== undefined
              ? Date.parse(String(hiRaw))
              : undefined;
        if (Number.isNaN(a)) return false;
        if (lo !== undefined && !Number.isNaN(lo) && a < lo) return false;
        if (hi !== undefined && !Number.isNaN(hi) && a > hi) return false;
        return true;
      }
      default:
        return true;
    }
  }
  return true;
}

function parseFilters(ctx: MockRequestContext): FilterTree | undefined {
  const raw = ctx.query.get("f");
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return undefined;
    return parsed as FilterTree;
  } catch {
    return undefined;
  }
}

function parseSort(ctx: MockRequestContext): { field: string; direction: "asc" | "desc" }[] {
  const raw = ctx.query.get("sort");
  if (!raw) return [];
  return raw
    .split(",")
    .map((part) => {
      const [field, dir] = part.split(":");
      return {
        field: field ?? "",
        direction: dir === "desc" ? ("desc" as const) : ("asc" as const),
      };
    })
    .filter((s) => s.field !== "");
}

function facetBuckets(rows: Record<string, unknown>[], field: string) {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const value = String(row[field] ?? "");
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return { field, buckets: [...counts.entries()].map(([value, count]) => ({ value, count })) };
}

function pageOf<T>(rows: T[], page: number, pageSize: number): T[] {
  return rows.slice((page - 1) * pageSize, page * pageSize);
}

/** 服务端点（offset 分页 + facets + and/or 树过滤 + 多列排序 + 批量与冲突演示） */
export const serviceRoutes: MockRoute[] = [
  {
    method: "GET",
    path: "/api/t/:tid/services",
    handler: (ctx) => {
      if (!requireUser(ctx.req)) return fail(401, "未登录或登录已过期");
      const gated = demoErrorGate(ctx);
      if (gated) return gated;

      const services = servicesOf(ctx.params.tid ?? "");
      const filters = parseFilters(ctx);
      const q = ctx.query.get("q")?.toLowerCase() ?? "";
      const sort = parseSort(ctx);

      let rows: MockService[] = services.filter((row) =>
        evaluateTree(row as unknown as Record<string, unknown>, filters),
      );
      if (q !== "") {
        rows = rows.filter((row) => row.name.toLowerCase().includes(q));
      }
      if (sort.length > 0) {
        rows = [...rows].sort((a, b) => {
          for (const s of sort) {
            const av = (a as unknown as Record<string, unknown>)[s.field];
            const bv = (b as unknown as Record<string, unknown>)[s.field];
            const cmp =
              typeof av === "number" && typeof bv === "number"
                ? av - bv
                : String(av ?? "").localeCompare(String(bv ?? ""));
            if (cmp !== 0) return s.direction === "asc" ? cmp : -cmp;
          }
          return 0;
        });
      }

      const page = Number(ctx.query.get("page") ?? "1") || 1;
      const pageSize = Math.min(Number(ctx.query.get("pageSize") ?? "20") || 20, 500);
      const facetsParam = (ctx.query.get("facets") ?? "").split(",").filter(Boolean);
      const facetSource = rows.filter((row) =>
        evaluateTree(
          row as unknown as Record<string, unknown>,
          filters === undefined
            ? undefined
            : isFilterNode(filters)
              ? {
                  combinator: filters.combinator,
                  children: filters.children.filter(
                    (c) => !(isFilterLeaf(c) && facetsParam.includes(c.field)),
                  ),
                }
              : isFilterLeaf(filters) && facetsParam.includes(filters.field)
                ? undefined
                : filters,
        ),
      );

      return ok({
        rows: pageOf(rows, page, pageSize),
        total: rows.length,
        facets: facetsParam.map((field) =>
          facetBuckets(facetSource as unknown as Record<string, unknown>[], field),
        ),
      });
    },
  },
  {
    method: "POST",
    path: "/api/t/:tid/services",
    handler: (ctx) => {
      if (!requireUser(ctx.req)) return fail(401, "未登录或登录已过期");
      const gated = demoErrorGate(ctx);
      if (gated) return gated;
      const body = (ctx.body ?? {}) as Partial<MockService> & { name?: unknown };
      // 422 字段错误演示：name < 3 字符 / env 非法（{ fields, form? } 形状，core useResourceForm 消费）
      const fields: Record<string, string> = {};
      if (typeof body.name !== "string" || body.name.trim() === "") {
        fields.name = "名称必填";
      } else if (body.name.trim().length < 3) {
        fields.name = "名称至少 3 个字符（服务端校验）";
      } else if (body.name.toLowerCase().includes("taken")) {
        // 服务端独有规则（客户端 zod 不含）：演示 422 字段错误回填
        fields.name = "该名称已被占用（服务端独有校验）";
      }
      if (body.env !== undefined && !["rep", "staging", "prod"].includes(String(body.env))) {
        fields.env = `环境只能是 rep/staging/prod（收到 "${String(body.env)}"）`;
      }
      if (Object.keys(fields).length > 0) {
        return {
          status: 422,
          body: { fields, form: "请修正标记的字段后重试", message: "校验失败" },
        };
      }
      const services = servicesOf(ctx.params.tid ?? "");
      const now = new Date().toISOString();
      const row: MockService = {
        id: `svc-new-${randomUUID().slice(0, 8)}`,
        name: body.name as string,
        env: body.env ?? "rep",
        status: "stopped",
        replicas: body.replicas ?? 1,
        region: body.region ?? "cn-beijing",
        owner: body.owner ?? "usr_demo",
        createdAt: now,
        updatedAt: now,
        version: 1,
      };
      services.unshift(row);
      return ok(row, 201);
    },
  },
  {
    method: "POST",
    path: "/api/t/:tid/services/bulk-delete",
    handler: (ctx) => {
      if (!requireUser(ctx.req)) return fail(401, "未登录或登录已过期");
      const { ids } = (ctx.body ?? {}) as { ids?: string[] };
      if (!Array.isArray(ids)) return fail(422, "ids 必填");
      const services = servicesOf(ctx.params.tid ?? "");
      const result = { succeeded: [] as string[], failed: [] as { id: string; error: unknown }[] };
      for (const id of ids) {
        const idx = services.findIndex((s) => s.id === id);
        if (idx < 0) {
          result.failed.push({ id, error: { status: 404, message: "不存在" } });
        } else if (services[idx]?.status === "stopped") {
          // 部分失败演示：stopped 状态的服务不允许删除
          result.failed.push({
            id,
            error: { status: 409, message: "服务已停止，无法批量删除" },
          });
        } else {
          services.splice(idx, 1);
          result.succeeded.push(id);
        }
      }
      return ok(result);
    },
  },
  {
    method: "POST",
    path: "/api/t/:tid/services/bulk-update",
    handler: (ctx) => {
      if (!requireUser(ctx.req)) return fail(401, "未登录或登录已过期");
      const { ids, vars } = (ctx.body ?? {}) as { ids?: string[]; vars?: Partial<MockService> };
      if (!Array.isArray(ids) || vars === undefined) return fail(422, "ids/vars 必填");
      const services = servicesOf(ctx.params.tid ?? "");
      const result = { succeeded: [] as string[], failed: [] as { id: string; error: unknown }[] };
      for (const id of ids) {
        const row = services.find((s) => s.id === id);
        if (!row) {
          result.failed.push({ id, error: { status: 404, message: "不存在" } });
        } else if (row.env === "prod") {
          // 部分失败演示：prod 环境不允许批量修改
          result.failed.push({
            id,
            error: { status: 403, message: "生产环境服务不允许批量修改" },
          });
        } else {
          Object.assign(row, vars, {
            updatedAt: new Date().toISOString(),
            version: row.version + 1,
          });
          result.succeeded.push(id);
        }
      }
      return ok(result);
    },
  },
  {
    method: "GET",
    path: "/api/t/:tid/services/:id",
    handler: (ctx) => {
      if (!requireUser(ctx.req)) return fail(401, "未登录或登录已过期");
      const row = servicesOf(ctx.params.tid ?? "").find((s) => s.id === ctx.params.id);
      if (!row) return fail(404, "服务不存在");
      return ok(row);
    },
  },
  {
    method: "PUT",
    path: "/api/t/:tid/services/:id",
    handler: (ctx) => {
      if (!requireUser(ctx.req)) return fail(401, "未登录或登录已过期");
      const gated = demoErrorGate(ctx);
      if (gated) return gated;
      const row = servicesOf(ctx.params.tid ?? "").find((s) => s.id === ctx.params.id);
      if (!row) return fail(404, "服务不存在");
      // 409 严格乐观并发：If-Match 缺失或不符 → 冲突（M3 起演示表单 409 流）
      const ifMatch = ctx.req.headers["if-match"];
      const expectedVersion = Array.isArray(ifMatch) ? ifMatch[0] : ifMatch;
      if (expectedVersion === undefined) {
        return fail(409, "缺少 If-Match 版本头：编辑必须基于当前版本（M3 起强制乐观并发）");
      }
      if (expectedVersion !== String(row.version)) {
        return fail(409, `版本冲突：期望 ${row.version}，收到 ${expectedVersion}`);
      }
      const body = (ctx.body ?? {}) as Partial<MockService>;
      Object.assign(row, body, {
        id: row.id,
        updatedAt: new Date().toISOString(),
        version: row.version + 1,
      });
      return ok(row);
    },
  },
  {
    method: "DELETE",
    path: "/api/t/:tid/services/:id",
    handler: (ctx) => {
      if (!requireUser(ctx.req)) return fail(401, "未登录或登录已过期");
      const gated = demoErrorGate(ctx);
      if (gated) return gated;
      const services = servicesOf(ctx.params.tid ?? "");
      const idx = services.findIndex((s) => s.id === ctx.params.id);
      if (idx < 0) return fail(404, "服务不存在");
      services.splice(idx, 1);
      return { status: 204 };
    },
  },
];
