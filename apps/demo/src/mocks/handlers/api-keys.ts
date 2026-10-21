import { randomUUID } from "node:crypto";
import { apiKeysOf, findUserByToken } from "../db";
import type { MockRoute } from "../types";

function requireUser(req: { headers: { authorization?: string } }) {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return undefined;
  return findUserByToken(header.slice("Bearer ".length));
}

/** 过期档位（创建时选择；沿用 createdAt 相对计算保证稳定） */
const EXPIRY_PRESETS: Record<string, number> = {
  "30d": 30,
  "90d": 90,
  "180d": 180,
  never: -1,
};

/** 一次性 secret：仅创建响应携带；列表/详情永不返回 */
function generateSecret(): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const body = Array.from(
    { length: 36 },
    () => alphabet[Math.floor(Math.random() * alphabet.length)],
  ).join("");
  return `fl_${body}`;
}

/**
 * M3 mock：api-keys —— GET 列表（secret 永不返回）、POST 创建（一次性 secret）、DELETE 吊销。
 */
export const apiKeyRoutes: MockRoute[] = [
  {
    method: "GET",
    path: "/api/t/:tid/api-keys",
    handler: (ctx) => {
      if (!requireUser(ctx.req)) return { status: 401, body: { message: "未登录或登录已过期" } };
      const rows = apiKeysOf(ctx.params.tid ?? "").map(({ _secretOnce, ...row }) => {
        void _secretOnce;
        return row;
      });
      return { status: 200, body: { rows, total: rows.length } };
    },
  },
  {
    method: "POST",
    path: "/api/t/:tid/api-keys",
    handler: (ctx) => {
      if (!requireUser(ctx.req)) return { status: 401, body: { message: "未登录或登录已过期" } };
      const body = (ctx.body ?? {}) as { name?: unknown; expiresIn?: unknown };
      const fields: Record<string, string> = {};
      if (typeof body.name !== "string" || body.name.trim() === "") {
        fields.name = "名称必填";
      } else if (body.name.trim().length < 3) {
        fields.name = "名称至少 3 个字符";
      }
      const expiresIn = body.expiresIn === undefined ? "30d" : String(body.expiresIn);
      if (!(expiresIn in EXPIRY_PRESETS)) {
        fields.expiresIn = "过期档位必须是 30d/90d/180d/never";
      }
      if (Object.keys(fields).length > 0) {
        return { status: 422, body: { fields, message: "校验失败" } };
      }
      const secret = generateSecret();
      const created = new Date();
      const days = EXPIRY_PRESETS[expiresIn] ?? 30;
      const row = {
        id: `key_${randomUUID().slice(0, 8)}`,
        name: String(body.name).trim(),
        prefix: secret.slice(0, 8),
        createdAt: created.toISOString(),
        ...(days > 0
          ? { expiresAt: new Date(created.getTime() + days * 86_400_000).toISOString() }
          : {}),
      };
      apiKeysOf(ctx.params.tid ?? "").unshift(row);
      // secret 只此一次
      return { status: 201, body: { ...row, secret } };
    },
  },
  {
    method: "DELETE",
    path: "/api/t/:tid/api-keys/:id",
    handler: (ctx) => {
      if (!requireUser(ctx.req)) return { status: 401, body: { message: "未登录或登录已过期" } };
      const rows = apiKeysOf(ctx.params.tid ?? "");
      const index = rows.findIndex((k) => k.id === ctx.params.id);
      if (index < 0) return { status: 404, body: { message: "API Key 不存在" } };
      rows.splice(index, 1);
      return { status: 204 };
    },
  },
];
