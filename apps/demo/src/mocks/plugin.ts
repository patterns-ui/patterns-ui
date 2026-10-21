import type { IncomingMessage, ServerResponse } from "node:http";
import type { Plugin } from "vite";
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
 * Vite dev 中间件插件：拦截 /api/* 请求并转给内存 mock（150–300ms 延迟模拟网络）。
 */
export function mockApiPlugin(): Plugin {
  return {
    name: "demo-mock-api",
    configureServer(server) {
      server.middlewares.use((req: IncomingMessage, res: ServerResponse, next: () => void) => {
        void (async () => {
          const url = new URL(req.url ?? "/", "http://localhost");
          if (!url.pathname.startsWith("/api/")) {
            next();
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
            setTimeout(r, MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS)),
          );
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
    },
  };
}
