import { randomUUID } from "node:crypto";
import {
  auditEventsOf,
  db,
  findUserByToken,
  invitationsOf,
  type MemberRole,
  membersOf,
  metricsPointsOf,
  notificationsOf,
  regionsOf,
  servicesOf,
  usersForRef,
} from "../db";
import { fail, type MockRequestContext, type MockRoute, ok } from "../types";

function bearerToken(req: { headers: { authorization?: string } }): string | null {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}

function requireUser(req: MockRequestContext["req"]): boolean {
  return findUserByToken(bearerToken(req)) !== undefined;
}

const ROLES: MemberRole[] = ["owner", "admin", "member", "viewer"];

/**
 * M4 mock 端点：members / invitations / notifications（keyset + 已读）/ 全局搜索聚合 /
 * regions（树形 region→zone）/ metrics-points（1000 行虚拟化演示）。
 */
export const teamRoutes: MockRoute[] = [
  // ---- members ----
  {
    method: "GET",
    path: "/api/t/:tid/members",
    handler: (ctx) => {
      if (!requireUser(ctx.req)) return fail(401, "未登录或登录已过期");
      const members = membersOf(ctx.params.tid ?? "");
      return ok({ rows: members, total: members.length });
    },
  },
  {
    method: "PATCH",
    path: "/api/t/:tid/members/:id",
    handler: (ctx) => {
      if (!requireUser(ctx.req)) return fail(401, "未登录或登录已过期");
      const member = membersOf(ctx.params.tid ?? "").find((m) => m.id === ctx.params.id);
      if (!member) return fail(404, "成员不存在");
      if (member.role === "owner") return fail(403, "不能修改 owner 的角色");
      const body = (ctx.body ?? {}) as { role?: unknown };
      if (typeof body.role !== "string" || !ROLES.includes(body.role as MemberRole)) {
        return fail(422, "role 必须是 owner/admin/member/viewer");
      }
      member.role = body.role as MemberRole;
      return ok(member);
    },
  },
  {
    method: "DELETE",
    path: "/api/t/:tid/members/:id",
    handler: (ctx) => {
      if (!requireUser(ctx.req)) return fail(401, "未登录或登录已过期");
      const members = membersOf(ctx.params.tid ?? "");
      const idx = members.findIndex((m) => m.id === ctx.params.id);
      if (idx < 0) return fail(404, "成员不存在");
      if (members[idx]?.role === "owner") return fail(403, "不能移除 owner");
      members.splice(idx, 1);
      return { status: 204 };
    },
  },

  // ---- invitations ----
  {
    method: "GET",
    path: "/api/t/:tid/invitations",
    handler: (ctx) => {
      if (!requireUser(ctx.req)) return fail(401, "未登录或登录已过期");
      const rows = invitationsOf(ctx.params.tid ?? "");
      return ok({ rows, total: rows.length });
    },
  },
  {
    method: "POST",
    path: "/api/t/:tid/invitations",
    handler: (ctx) => {
      if (!requireUser(ctx.req)) return fail(401, "未登录或登录已过期");
      const body = (ctx.body ?? {}) as { email?: unknown; role?: unknown };
      const fields: Record<string, string> = {};
      if (typeof body.email !== "string" || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) {
        fields.email = "邮箱格式无效";
      }
      if (typeof body.role !== "string" || !ROLES.includes(body.role as MemberRole)) {
        fields.role = "角色必须是 owner/admin/member/viewer";
      }
      if (Object.keys(fields).length > 0) {
        return { status: 422, body: { fields, form: "请修正后重试" } };
      }
      const rows = invitationsOf(ctx.params.tid ?? "");
      if (rows.some((r) => r.email === body.email && r.status === "pending")) {
        return {
          status: 422,
          body: { fields: { email: "该邮箱已有待处理邀请" }, form: "请修正后重试" },
        };
      }
      const invite = {
        id: `inv_${randomUUID().slice(0, 8)}`,
        email: body.email as string,
        role: body.role as MemberRole,
        invitedBy: "usr_demo",
        createdAt: new Date().toISOString(),
        status: "pending" as const,
      };
      rows.unshift(invite);
      return ok(invite, 201);
    },
  },
  {
    method: "DELETE",
    path: "/api/t/:tid/invitations/:id",
    handler: (ctx) => {
      if (!requireUser(ctx.req)) return fail(401, "未登录或登录已过期");
      const rows = invitationsOf(ctx.params.tid ?? "");
      const idx = rows.findIndex((r) => r.id === ctx.params.id);
      if (idx < 0) return fail(404, "邀请不存在");
      rows.splice(idx, 1);
      return { status: 204 };
    },
  },
  {
    // 演示端点：接受邀请 → 变成成员 + 邀请置 accepted
    method: "POST",
    path: "/api/t/:tid/invitations/:id/accept",
    handler: (ctx) => {
      if (!requireUser(ctx.req)) return fail(401, "未登录或登录已过期");
      const rows = invitationsOf(ctx.params.tid ?? "");
      const invite = rows.find((r) => r.id === ctx.params.id);
      if (!invite) return fail(404, "邀请不存在");
      if (invite.status !== "pending") return fail(409, "邀请已处理");
      invite.status = "accepted";
      const members = membersOf(ctx.params.tid ?? "");
      const member = {
        id: `usr_new_${randomUUID().slice(0, 6)}`,
        name: invite.email.split("@")[0] ?? "new member",
        email: invite.email,
        role: invite.role,
        twoFactorEnabled: false,
        joinedAt: new Date().toISOString(),
      };
      members.push(member);
      return ok({ invitation: invite, member });
    },
  },

  // ---- notifications（keyset + read 状态） ----
  {
    method: "GET",
    path: "/api/t/:tid/notifications",
    handler: (ctx) => {
      if (!requireUser(ctx.req)) return fail(401, "未登录或登录已过期");
      const rows = notificationsOf(ctx.params.tid ?? "");
      const pageSize = Math.min(Number(ctx.query.get("pageSize") ?? "30") || 30, 100);
      const cursor = ctx.query.get("cursor");
      let start = 0;
      if (cursor) {
        // 游标 = 最后一条的 id（rows 本身按 createdAt desc 稳定排序）
        const idx = rows.findIndex((r) => r.id === cursor);
        start = idx >= 0 ? idx + 1 : 0;
      }
      const page = rows.slice(start, start + pageSize);
      const readParam = ctx.query.get("read");
      const filtered =
        readParam === "true" || readParam === "false"
          ? page.filter((r) => String(r.read) === readParam)
          : page;
      return ok({
        rows: filtered,
        nextCursor: start + pageSize < rows.length ? page.at(-1)?.id : undefined,
        total: rows.length,
      });
    },
  },
  {
    method: "PATCH",
    path: "/api/t/:tid/notifications/:id",
    handler: (ctx) => {
      if (!requireUser(ctx.req)) return fail(401, "未登录或登录已过期");
      const row = notificationsOf(ctx.params.tid ?? "").find((n) => n.id === ctx.params.id);
      if (!row) return fail(404, "通知不存在");
      const body = (ctx.body ?? {}) as { read?: unknown };
      if (typeof body.read === "boolean") row.read = body.read;
      return ok(row);
    },
  },
  {
    method: "POST",
    path: "/api/t/:tid/notifications/read-all",
    handler: (ctx) => {
      if (!requireUser(ctx.req)) return fail(401, "未登录或登录已过期");
      const body = (ctx.body ?? {}) as { ids?: string[] };
      const rows = notificationsOf(ctx.params.tid ?? "");
      let count = 0;
      for (const row of rows) {
        if (body.ids === undefined || body.ids.includes(row.id)) {
          if (!row.read) count += 1;
          row.read = true;
        }
      }
      return ok({ updated: count });
    },
  },

  // ---- 全局搜索聚合（services / members / audit-events 各 top5） ----
  {
    method: "GET",
    path: "/api/search",
    handler: (ctx) => {
      if (!requireUser(ctx.req)) return fail(401, "未登录或登录已过期");
      const q = (ctx.query.get("q") ?? "").trim().toLowerCase();
      const tid = ctx.query.get("tid") ?? "";
      if (q === "") return ok({ services: [], members: [], auditEvents: [] });

      const services = servicesOf(tid)
        .filter((s) => s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q))
        .slice(0, 5)
        .map((s) => ({
          id: s.id,
          title: s.name,
          subtitle: s.id,
          type: "service",
          ref: `services/${s.id}`,
        }));

      const members = membersOf(tid)
        .filter((m) => m.name.toLowerCase().includes(q) || m.email.toLowerCase().includes(q))
        .slice(0, 5)
        .map((m) => ({
          id: m.id,
          title: m.name,
          subtitle: m.email,
          type: "member",
          ref: `members/${m.id}`,
        }));

      const auditEvents = auditEventsOf(tid)
        .filter(
          (e) =>
            e.action.toLowerCase().includes(q) ||
            e.resource.toLowerCase().includes(q) ||
            e.id.toLowerCase().includes(q),
        )
        .slice(0, 5)
        .map((e) => ({
          id: e.id,
          title: e.action,
          subtitle: e.resource,
          type: "audit-event",
          ref: `audit-events/${e.id}`,
        }));

      return ok({ services, members, auditEvents, actors: usersForRef().length });
    },
  },

  // ---- regions（树形：region 含 zones 子树） ----
  {
    method: "GET",
    path: "/api/t/:tid/regions",
    handler: (ctx) => {
      if (!requireUser(ctx.req)) return fail(401, "未登录或登录已过期");
      const rows = regionsOf(ctx.params.tid ?? "");
      return ok({ rows, total: rows.length });
    },
  },

  // ---- metrics-points（1000 行大列表：虚拟化演示；一次全量返回） ----
  {
    method: "GET",
    path: "/api/t/:tid/metrics-points",
    handler: (ctx) => {
      if (!requireUser(ctx.req)) return fail(401, "未登录或登录已过期");
      const rows = metricsPointsOf(ctx.params.tid ?? "");
      // pageSize 超大（>=1000）或 ?all=1 → 全量（虚拟化演示页用）；否则普通分页
      const pageSize = Number(ctx.query.get("pageSize") ?? "20") || 20;
      if (ctx.query.get("all") === "1" || pageSize >= 1000) {
        return ok({ rows, total: rows.length });
      }
      const page = Number(ctx.query.get("page") ?? "1") || 1;
      return ok({
        rows: rows.slice((page - 1) * pageSize, page * pageSize),
        total: rows.length,
      });
    },
  },
];

// ---- 设置页（profile / password / org name） ----
export const settingsRoutes: MockRoute[] = [
  {
    method: "PATCH",
    path: "/api/me",
    handler: (ctx) => {
      const user = findUserByToken(bearerToken(ctx.req));
      if (!user) return fail(401, "未登录或登录已过期");
      const body = (ctx.body ?? {}) as {
        displayName?: string;
        email?: string;
        timeZone?: string;
      };
      if (body.displayName !== undefined) {
        if (body.displayName.trim().length < 2) {
          return {
            status: 422,
            body: { fields: { displayName: "显示名至少 2 个字符（服务端）" } },
          };
        }
        user.name = body.displayName;
      }
      if (body.email !== undefined) {
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(body.email)) {
          return { status: 422, body: { fields: { email: "邮箱格式无效（服务端）" } } };
        }
        user.email = body.email;
      }
      return ok(user);
    },
  },
  {
    method: "POST",
    path: "/api/me/password",
    handler: (ctx) => {
      const user = findUserByToken(bearerToken(ctx.req));
      if (!user) return fail(401, "未登录或登录已过期");
      const body = (ctx.body ?? {}) as { currentPassword?: string; newPassword?: string };
      // demo 约定：当前密码 demo1234；新密码 taken 保留字演示失败
      if (body.currentPassword !== "demo1234") {
        return {
          status: 422,
          body: { fields: { currentPassword: "当前密码不正确（demo 约定：demo1234）" } },
        };
      }
      if ((body.newPassword ?? "").length < 8) {
        return { status: 422, body: { fields: { newPassword: "新密码至少 8 位" } } };
      }
      return ok({ ok: true });
    },
  },
  {
    method: "PATCH",
    path: "/api/orgs/:id",
    handler: (ctx) => {
      if (!requireUser(ctx.req)) return fail(401, "未登录或登录已过期");
      const org = db.orgs.find((o) => o.id === ctx.params.id);
      if (!org) return fail(404, "租户不存在");
      const body = (ctx.body ?? {}) as { name?: string };
      if (typeof body.name === "string" && body.name.trim() !== "") org.name = body.name;
      return ok(org);
    },
  },
];
