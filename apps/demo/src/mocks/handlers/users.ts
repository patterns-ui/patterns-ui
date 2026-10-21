import { randomUUID } from "node:crypto";
import { findUserByToken, usersForRef } from "../db";
import type { MockRoute } from "../types";
import { evaluateTree } from "./services";

function requireUser(req: { headers: { authorization?: string } }) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return false;
  return findUserByToken(header.slice("Bearer ".length)) !== undefined;
}

/** 简单 slug：Demo User → demo-user */
function slug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 24);
}

/**
 * M3 mock：/api/users —— reference-select 的搜索/分页/就地新建数据源
 * （service 的 owner 选择演示；非租户作用域的轻量只读+创建端点）。
 */
export const userRoutes: MockRoute[] = [
  {
    method: "GET",
    path: "/api/users",
    handler: (ctx) => {
      if (!requireUser(ctx.req)) return { status: 401, body: { message: "未登录或登录已过期" } };
      const q = ctx.query.get("q")?.toLowerCase() ?? "";
      const all = usersForRef().map(({ id, name, email, avatarUrl }) => ({
        id,
        name,
        email,
        ...(avatarUrl ? { avatarUrl } : {}),
      }));
      let filtered =
        q === "" ? all : all.filter((u) => u.name.toLowerCase().includes(q) || u.email.includes(q));
      // f 过滤树（getMany 兜底的 id in 查询走这里）
      const rawF = ctx.query.get("f");
      if (rawF) {
        try {
          const tree = JSON.parse(rawF);
          if (tree && typeof tree === "object") {
            filtered = filtered.filter((u) =>
              evaluateTree(u as unknown as Record<string, unknown>, tree),
            );
          }
        } catch {
          /* 忽略坏树 */
        }
      }
      const page = Number(ctx.query.get("page") ?? "1") || 1;
      const pageSize = Math.min(Number(ctx.query.get("pageSize") ?? "25") || 25, 100);
      return {
        status: 200,
        body: {
          rows: filtered.slice((page - 1) * pageSize, page * pageSize),
          total: filtered.length,
        },
      };
    },
  },
  {
    method: "POST",
    path: "/api/users",
    handler: (ctx) => {
      if (!requireUser(ctx.req)) return { status: 401, body: { message: "未登录或登录已过期" } };
      const body = (ctx.body ?? {}) as { name?: unknown };
      if (typeof body.name !== "string" || body.name.trim() === "") {
        return { status: 422, body: { fields: { name: "名称必填" }, message: "校验失败" } };
      }
      const name = body.name.trim();
      const exists = usersForRef().some((u) => u.name === name);
      if (exists) {
        return { status: 422, body: { fields: { name: "该用户已存在" }, message: "校验失败" } };
      }
      const id = `usr_${slug(name) || randomUUID().slice(0, 6)}`;
      usersForRef().push({
        id,
        name,
        email: `${slug(name) || "member"}@fleetly.dev`,
        role: "member",
        permissions: [],
      });
      return { status: 201, body: { id, name, email: `${slug(name)}@fleetly.dev` } };
    },
  },
];
