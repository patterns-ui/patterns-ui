import { certificatesOf, findUserByToken, type MockCertificate } from "../db";
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

function parseFilters(ctx: MockRequestContext): MockFilterTree | undefined {
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

function pageOf<T>(rows: T[], page: number, pageSize: number): T[] {
  return rows.slice((page - 1) * pageSize, page * pageSize);
}

/**
 * certificates 端点（只读列表：page 协议 ?page=&pageSize= + and/or 树过滤 +
 * 搜索 + 多列排序 + total）。无 POST/PUT/DELETE——证书由平台自动签发与轮换。
 */
export const certificateRoutes: MockRoute[] = [
  {
    method: "GET",
    path: "/api/t/:tid/certificates",
    handler: (ctx) => {
      if (!requireUser(ctx.req)) return fail(401, "未登录或登录已过期");
      // x-demo-error chaos 派发已上收 mock 入口统一处理（M7-B2 迁移，见 ../chaos.ts）

      const all = certificatesOf(ctx.params.tid ?? "");
      const filters = parseFilters(ctx);
      const q = ctx.query.get("q")?.toLowerCase() ?? "";
      const sort = parseSort(ctx);

      let rows: MockCertificate[] = all.filter((row) =>
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

      // page 协议：页码窗口可跳页的前提是 total 必有（无 facet 参数——def 未声明 facets）
      return ok({
        rows: pageOf(rows, page, pageSize),
        total: rows.length,
      });
    },
  },
];
