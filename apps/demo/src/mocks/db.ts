/**
 * mock 内存数据库（仅 demo dev 使用；M2 起扩充资源端点）。
 */

export interface MockUser {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string;
  role: string;
  permissions: string[];
}

export interface MockTenant {
  id: string;
  name: string;
  plan: string;
  avatarUrl?: string;
  description: string;
}

/** 简单 SVG data-URI 头像（带底色与首字母），无需外部资源 */
function avatarDataUri(initial: string, hue: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="hsl(${hue} 55% 42%)"/><text x="16" y="21.5" font-family="system-ui,sans-serif" font-size="14" font-weight="600" fill="white" text-anchor="middle">${initial}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

export const DEMO_EMAIL = "demo@fleetly.dev";

export const db = {
  users: [
    {
      id: "usr_demo",
      name: "Demo User",
      email: DEMO_EMAIL,
      role: "owner",
      permissions: ["*"],
    },
  ] satisfies MockUser[],
  orgs: [
    {
      id: "acme-web",
      name: "Acme Web",
      plan: "pro",
      avatarUrl: avatarDataUri("A", 262),
      description: "主站前端与边缘服务。",
    },
    {
      id: "torchwood",
      name: "Torchwood Labs",
      plan: "team",
      avatarUrl: avatarDataUri("T", 175),
      description: "内部实验与预发环境。",
    },
    {
      id: "playground",
      name: "Playground",
      plan: "free",
      avatarUrl: avatarDataUri("P", 30),
      description: "个人沙箱，随时重建。",
    },
  ] satisfies MockTenant[],
  /** token → userId */
  tokens: new Map<string, string>(),
};

export function findUserByToken(token: string | null | undefined): MockUser | undefined {
  if (!token) {
    return undefined;
  }
  const userId = db.tokens.get(token);
  if (!userId) {
    return undefined;
  }
  return db.users.find((u) => u.id === userId);
}
