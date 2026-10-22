import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
import { chaosGate } from "./chaos";
import { mulberry32, resetMockDb } from "./db";
import { apiKeyRoutes } from "./handlers/api-keys";
import { auditRoutes } from "./handlers/audit";
import { authRoutes } from "./handlers/auth";
import { deploymentRoutes } from "./handlers/deployments";
import { orgRoutes } from "./handlers/orgs";
import { serviceRoutes } from "./handlers/services";
import { settingsRoutes, teamRoutes } from "./handlers/team";
import { userRoutes } from "./handlers/users";
import type { MockResult, MockRoute } from "./types";

/**
 * mock API 路由表（模块化注册：新端点在 handlers/ 下加文件后并入 routes）。
 * 注意：具体路径（bulk-*、read-all、accept）必须排在 :id 参数路径之前。
 */
const routes: MockRoute[] = [
  ...authRoutes,
  ...orgRoutes,
  ...userRoutes,
  ...serviceRoutes,
  ...deploymentRoutes,
  ...apiKeyRoutes,
  ...auditRoutes,
  ...teamRoutes,
  ...settingsRoutes,
];

const MIN_DELAY_MS = 150;
const MAX_DELAY_MS = 300;
/** 模拟网络延迟（M6-E：确定性 PRNG 替代 Math.random——序列可复现，无随机条纹） */
const delayRng = mulberry32(0x6d2b79f5);

function matchRoute(
  method: string,
  pathname: string,
): { route: MockRoute; params: Record<string, string> } | undefined {
  for (const route of routes) {
    if (route.method !== method) {
      continue;
    }
    const pattern = route.path.split("/").filter(Boolean);
    const actual = pathname.split("/").filter(Boolean);
    if (pattern.length !== actual.length) {
      continue;
    }
    const params: Record<string, string> = {};
    let matched = true;
    for (let i = 0; i < pattern.length; i++) {
      const p = pattern[i];
      const a = actual[i] ?? "";
      if (p?.startsWith(":")) {
        params[p.slice(1)] = decodeURIComponent(a);
      } else if (p !== a) {
        matched = false;
        break;
      }
    }
    if (matched) {
      return { route, params };
    }
  }
  return undefined;
}

function readBody(req: IncomingMessage): Promise<unknown> {
  if (req.method !== "POST" && req.method !== "PUT" && req.method !== "PATCH") {
    return Promise.resolve(undefined);
  }
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) {
        resolve(undefined);
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(raw);
      }
    });
    req.on("error", () => resolve(undefined));
  });
}

function sendJson(res: ServerResponse, result: MockResult): void {
  res.statusCode = result.status;
  res.setHeader("content-type", "application/json");
  res.end(result.body === undefined ? "" : JSON.stringify(result.body));
}

/**
 * Vite 中间件插件：拦截 /api/* 请求并转给内存 mock（150–300ms 延迟模拟网络）。
 * dev（configureServer）与 preview（configurePreviewServer）都挂载，保证生产构建预览可用。
 */
function installMiddleware(middlewares: {
  use: (fn: (req: IncomingMessage, res: ServerResponse, next: () => void) => void) => unknown;
}) {
  middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
    void (async () => {
      const url = new URL(req.url ?? "/", "http://localhost");
      if (!url.pathname.startsWith("/api/")) {
        next();
        return;
      }
      // e2e 重置端点（M7-B2 截图基线的确定性前提）：清空内存态 + 重种子；
      // ?now=<epoch-ms> 把种子时间锚定到该时刻（与浏览器冻结时钟同一时刻 →
      // 相对时间输出逐像素确定）。免鉴权、免 chaos，仅供测试进程调用。
      if (url.pathname === "/api/__e2e/reset") {
        if ((req.method ?? "") !== "POST") {
          sendJson(res, { status: 405, body: { message: "reset 仅支持 POST" } });
          return;
        }
        const nowParam = url.searchParams.get("now");
        const epoch = nowParam !== null && nowParam !== "" ? Number(nowParam) : Number.NaN;
        resetMockDb(Number.isFinite(epoch) ? epoch : undefined);
        sendJson(res, { status: 200, body: { ok: true } });
        return;
      }
      const match = matchRoute(req.method ?? "GET", url.pathname);
      if (!match) {
        sendJson(res, {
          status: 404,
          body: { message: `no mock for ${req.method} ${url.pathname}` },
        });
        return;
      }
      const body = await readBody(req);
      await new Promise((r) =>
        setTimeout(r, MIN_DELAY_MS + delayRng() * (MAX_DELAY_MS - MIN_DELAY_MS)),
      );
      // chaos 派发器（M7-B2）：x-demo-error 头（页面 ?demo-error= 由 api.ts 转发）
      // 命中则在 handler 前统一返回错误——覆盖全部路由组；语义单源见 ./chaos.ts。
      const chaos = chaosGate(req.headers, url.pathname);
      if (chaos) {
        sendJson(res, chaos);
        return;
      }
      const result = await match.route.handler({
        method: req.method ?? "GET",
        url,
        query: url.searchParams,
        params: match.params,
        body,
        req,
        res,
      });
      if (!result) {
        sendJson(res, { status: 404, body: { message: "mock handler returned nothing" } });
        return;
      }
      sendJson(res, result);
    })().catch(() => {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ message: "mock server error" }));
    });
  });
}

export function mockApiPlugin(): Plugin {
  return {
    name: "demo-mock-api",
    configureServer(server) {
      installMiddleware(server.middlewares);
    },
    configurePreviewServer(server) {
      installMiddleware(server.middlewares);
    },
  };
}
