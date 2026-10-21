import { randomUUID } from "node:crypto";
import { DEMO_EMAIL, db, findUserByToken } from "../db";
import { fail, type MockRoute, ok } from "../types";

function bearerToken(req: { headers: { authorization?: string } }): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    return null;
  }
  return header.slice("Bearer ".length);
}

/** 认证端点：POST /api/auth/login、POST /api/auth/logout、GET /api/me */
export const authRoutes: MockRoute[] = [
  {
    method: "POST",
    path: "/api/auth/login",
    handler: ({ body }) => {
      const { email, password } = (body ?? {}) as { email?: string; password?: string };
      if (email !== DEMO_EMAIL || typeof password !== "string" || password.length === 0) {
        return fail(401, "邮箱或密码错误");
      }
      const user = db.users.find((u) => u.email === email);
      if (!user) {
        return fail(401, "邮箱或密码错误");
      }
      const token = `tok_${randomUUID()}`;
      db.tokens.set(token, user.id);
      return ok({ token, user: { ...user, avatarUrl: undefined } });
    },
  },
  {
    method: "POST",
    path: "/api/auth/logout",
    handler: ({ req }) => {
      const token = bearerToken(req);
      if (token) {
        db.tokens.delete(token);
      }
      return { status: 204 };
    },
  },
  {
    method: "GET",
    path: "/api/me",
    handler: ({ req }) => {
      const user = findUserByToken(bearerToken(req));
      if (!user) {
        return fail(401, "未登录或登录已过期");
      }
      return ok({ user });
    },
  },
];
