import { randomUUID } from "node:crypto";
import {
  deploymentState,
  deploymentsOf,
  findUserByToken,
  type MockDeployment,
  type MockUser,
  servicesOf,
  taskState,
  tasks,
} from "../db";
import type { MockRoute } from "../types";

function bearerUser(req: { headers: { authorization?: string } }): MockUser | undefined {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) return undefined;
  return findUserByToken(header.slice("Bearer ".length));
}

/**
 * M3 mock：
 * - /api/t/:tid/services/:sid/deployments —— keyset 分页列表（cursor=createdAt,id 倒序）+ POST 触发（长任务）
 * - /api/t/:tid/services/:sid/deployments/:did —— PATCH 行内改 replicas
 * - /api/tasks/:id —— 任务状态机（queued→running(进度)→succeeded/failed，2.4–4s 推进）
 */
export const deploymentRoutes: MockRoute[] = [
  {
    method: "GET",
    path: "/api/t/:tid/services/:sid/deployments",
    handler: (ctx) => {
      const user = bearerUser(ctx.req);
      if (!user) return { status: 401, body: { message: "未登录或登录已过期" } };
      const rows = deploymentsOf(ctx.params.tid ?? "")
        .filter((row) => row.serviceId === ctx.params.sid)
        .map(deploymentState);
      const pageSize = Math.min(Number(ctx.query.get("pageSize") ?? "20") || 20, 100);
      const cursor = ctx.query.get("cursor");
      // keyset：cursor = "<createdAt>|<id>"；按 (createdAt desc, id desc) 稳定翻页
      const start = cursor ? rows.findIndex((r) => `${r.createdAt}|${r.id}` === cursor) + 1 : 0;
      const page = rows.slice(start, start + pageSize);
      const last = page.at(-1);
      return {
        status: 200,
        body: {
          rows: page,
          nextCursor:
            last && start + pageSize < rows.length ? `${last.createdAt}|${last.id}` : undefined,
        },
      };
    },
  },
  {
    method: "POST",
    path: "/api/t/:tid/services/:sid/deployments",
    handler: (ctx) => {
      const user = bearerUser(ctx.req);
      if (!user) return { status: 401, body: { message: "未登录或登录已过期" } };
      const service = servicesOf(ctx.params.tid ?? "").find((s) => s.id === ctx.params.sid);
      if (!service) return { status: 404, body: { message: "服务不存在" } };
      const body = (ctx.body ?? {}) as {
        source?: { kind?: string; ref?: string };
        branch?: string;
        replicas?: number;
        envOverrides?: Record<string, string>;
        simulate?: string;
      };
      if (!body.source || (body.source.kind !== "git" && body.source.kind !== "image")) {
        return { status: 422, body: { fields: { source: "来源必须是 git 或 image" } } };
      }
      if (body.source.kind === "git" && (body.branch ?? "").trim() === "") {
        return { status: 422, body: { fields: { branch: "git 来源必须提供分支" } } };
      }
      if (body.source.kind === "image" && (body.source.ref ?? "").trim() === "") {
        return { status: 422, body: { fields: { "source.ref": "镜像地址不能为空" } } };
      }

      const taskId = `task_${randomUUID().slice(0, 8)}`;
      tasks.set(taskId, {
        id: taskId,
        kind: "deployment",
        state: "queued",
        progress: 0,
        createdAt: Date.now(),
        // 2.4–4s 推进；simulate: "fail" 演示失败终态
        durationMs: 2400 + Math.round(Math.random() * 1600),
        failMode: body.simulate === "fail",
      });
      const row: MockDeployment = {
        id: `dep_${randomUUID().slice(0, 8)}`,
        serviceId: service.id,
        status: "queued",
        replicas: body.replicas ?? service.replicas,
        source: { kind: body.source.kind, ref: body.source.ref ?? "main" },
        branch: body.branch,
        envOverrides: body.envOverrides ?? {},
        taskId,
        progress: 0,
        createdAt: new Date().toISOString(),
        triggeredBy: user.id,
      };
      deploymentsOf(ctx.params.tid ?? "").unshift(row);
      return { status: 201, body: { id: row.id, taskId } };
    },
  },
  {
    method: "PATCH",
    path: "/api/t/:tid/services/:sid/deployments/:did",
    handler: (ctx) => {
      const user = bearerUser(ctx.req);
      if (!user) return { status: 401, body: { message: "未登录或登录已过期" } };
      const row = deploymentsOf(ctx.params.tid ?? "").find((d) => d.id === ctx.params.did);
      if (!row) return { status: 404, body: { message: "部署不存在" } };
      const body = (ctx.body ?? {}) as { replicas?: number };
      if (body.replicas !== undefined) {
        if (!Number.isInteger(body.replicas) || body.replicas < 1 || body.replicas > 50) {
          return { status: 422, body: { fields: { replicas: "副本数必须是 1-50 的整数" } } };
        }
        row.replicas = body.replicas;
      }
      return { status: 200, body: deploymentState(row) };
    },
  },
  {
    method: "GET",
    path: "/api/tasks/:id",
    handler: (ctx) => {
      const user = bearerUser(ctx.req);
      if (!user) return { status: 401, body: { message: "未登录或登录已过期" } };
      const task = tasks.get(ctx.params.id ?? "");
      if (!task) return { status: 404, body: { message: "任务不存在或已过期" } };
      return { status: 200, body: taskState(task) };
    },
  },
];
