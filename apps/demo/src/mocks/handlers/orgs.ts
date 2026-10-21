import { db, findUserByToken } from "../db";
import { fail, type MockRoute, ok } from "../types";

function bearerToken(req: { headers: { authorization?: string } }): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return null;
  }
  return header.slice("Bearer ".length);
}

function requireUser(req: { headers: { authorization?: string } }) {
  return findUserByToken(bearerToken(req));
}

/** 租户端点：GET /api/orgs、GET /api/orgs/:id */
export const orgRoutes: MockRoute[] = [
  {
    method: "GET",
    path: "/api/orgs",
    handler: ({ req }) => {
      if (!requireUser(req)) {
        return fail(401, "未登录或登录已过期");
      }
      return ok(db.orgs.map(({ id, name, plan, avatarUrl }) => ({ id, name, plan, avatarUrl })));
    },
  },
  {
    method: "GET",
    path: "/api/orgs/:id",
    handler: ({ req, params }) => {
      if (!requireUser(req)) {
        return fail(401, "未登录或登录已过期");
      }
      const org = db.orgs.find((o) => o.id === params.id);
      if (!org) {
        return fail(404, "租户不存在");
      }
      const { id, name, plan, avatarUrl, description } = org;
      return ok({ id, name, plan, avatarUrl, description });
    },
  },
];
