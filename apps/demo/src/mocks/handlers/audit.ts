import { randomUUID } from "node:crypto";
import { auditEventsOf, findUserByToken, type MockAuditEvent } from "../db";
import { fail, type MockFilterTree, type MockRequestContext, type MockRoute, ok } from "../types";
import { evaluateTree } from "./services";

function bearerToken(req: { headers: { authorization?: string } }): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}

function requireUser(req: MockRequestContext["req"]): boolean {
  return findUserByToken(bearerToken(req)) !== undefined;
}

/** keyset 游标：base64("<createdAtISO>|<id>")（按 createdAt desc, id desc 排序稳定翻页） */
function encodeCursor(row: MockAuditEvent): string {
  return Buffer.from(`${row.createdAt}|${row.id}`, "utf8").toString("base64");
}

function decodeCursor(raw: string | null): { createdAt: string; id: string } | undefined {
  if (!raw) return undefined;
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    const [createdAt, id] = decoded.split("|");
    if (!createdAt || !id) return undefined;
    return { createdAt, id };
  } catch {
    return undefined;
  }
}

function parseFilters(ctx: MockRequestContext) {
  const raw = ctx.query.get("f");
  if (!raw) return undefined;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return undefined;
    return parsed as MockFilterTree;
  } catch {
    return undefined;
  }
}

/** 审计事件端点（keyset 游标 + action facet + and/or 树过滤 + 时间范围；无 total） */
export const auditRoutes: MockRoute[] = [
  {
    method: "GET",
    path: "/api/t/:tid/audit-events",
    handler: (ctx) => {
      if (!requireUser(ctx.req)) return fail(401, "未登录或登录已过期");
      // x-demo-error chaos 派发已上收 mock 入口统一处理（M7-B2 迁移，见 ../chaos.ts）

      const all = auditEventsOf(ctx.params.tid ?? "");
      const filters = parseFilters(ctx);
      const q = ctx.query.get("q")?.toLowerCase() ?? "";
      const actionFilterLeaf =
        filters !== undefined && "field" in filters && filters.field === "action"
          ? filters
          : undefined;

      // 过滤（时间范围 between / action in / actor eq / 搜索子串）
      let rows = all.filter((row) =>
        evaluateTree(row as unknown as Record<string, unknown>, filters),
      );
      if (q !== "") {
        rows = rows.filter(
          (row) =>
            row.action.toLowerCase().includes(q) ||
            row.resource.toLowerCase().includes(q) ||
            row.actor.toLowerCase().includes(q),
        );
      }

      // keyset 翻页（createdAt desc, id desc；游标之后的行）
      const cursor = decodeCursor(ctx.query.get("cursor"));
      if (cursor) {
        const index = rows.findIndex((r) => r.createdAt === cursor.createdAt && r.id === cursor.id);
        rows = index >= 0 ? rows.slice(index + 1) : [];
      }

      const pageSize = Math.min(Number(ctx.query.get("pageSize") ?? "20") || 20, 200);
      const slice = rows.slice(0, pageSize);
      const hasNext = rows.length > pageSize;
      const lastRow = slice[slice.length - 1];

      // facets：action 计数（排除 action 自身的过滤，展示全量分布）
      const facetsParam = (ctx.query.get("facets") ?? "").split(",").filter(Boolean);
      const facetSource = all.filter((row) =>
        evaluateTree(
          row as unknown as Record<string, unknown>,
          actionFilterLeaf === undefined ? filters : undefined,
        ),
      );

      return ok({
        rows: slice,
        nextCursor: hasNext && lastRow !== undefined ? encodeCursor(lastRow) : undefined,
        facets: facetsParam.map((field) => {
          const counts = new Map<string, number>();
          for (const row of facetSource) {
            const value = String((row as unknown as Record<string, unknown>)[field] ?? "");
            counts.set(value, (counts.get(value) ?? 0) + 1);
          }
          return {
            field,
            buckets: [...counts.entries()].map(([value, count]) => ({ value, count })),
          };
        }),
      });
    },
  },
  {
    method: "POST",
    path: "/api/t/:tid/audit-events",
    handler: (ctx) => {
      if (!requireUser(ctx.req)) return fail(401, "未登录或登录已过期");
      const body = (ctx.body ?? {}) as Partial<MockAuditEvent>;
      if (!body.action) return fail(422, "action 必填");
      const row: MockAuditEvent = {
        id: `evt-new-${randomUUID().slice(0, 8)}`,
        action: body.action,
        actor: body.actor ?? "usr_demo",
        resource: body.resource ?? "unknown",
        ip: body.ip ?? "127.0.0.1",
        createdAt: new Date().toISOString(),
      };
      auditEventsOf(ctx.params.tid ?? "").unshift(row);
      return ok(row, 201);
    },
  },
];
