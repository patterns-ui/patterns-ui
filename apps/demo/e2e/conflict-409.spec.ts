/**
 * 409 乐观并发冲突（M7-C3，docs/paradigm.md §6-C3 / §1.2 写入一致「乐观并发」轴：
 * ETag+If-Match → 409 统一冲突提示 + 刷新）。
 *
 * 链路（services 编辑表单 + mock 严格 If-Match 语义，services.ts PUT：缺头或不符 → 409）：
 *  1. 打开编辑页（页面缓存版本 V）；
 *  2. 「另一人」经 API 直改同一资源（PUT + If-Match: V → 服务端版本 V+1）——
 *     两个真实上下文并发，不经页面内置的 409 演示按钮；
 *  3. 本页提交（仍带 If-Match: V）→ 409 → 统一冲突文案回显（表单级 alert）；
 *  4. 刷新 → 拿到他人版本（表单回显他人修改）；
 *  5. 再提交（If-Match: V+1）→ 成功 → toast + 回详情页（版本 V+2 经 API 核实）。
 *
 * 本页不输入任何字段：未触碰表单的 canSubmit 为真（TanStack Form v1 语义），且不产生
 * 草稿（autosave 只在值变化后落盘）——刷新后表单必然回显服务端最新值，闭环确定。
 *
 * 确定性三件套沿用 states-baseline.spec.ts 的 prepare() 惯例。
 */
import { type APIRequestContext, expect, type Page, test } from "@playwright/test";

const EPOCH = Date.parse("2026-10-23T08:00:00.000Z");
const DEMO_EMAIL = "demo@fleetly.dev";
const TOKEN_KEY = "demo:token";
const TENANT = "acme-web";
const SERVICE_ID = "ac-svc-001";

interface ServiceRow {
  id: string;
  name: string;
  version: number;
}

/** 确定性前提三件套 + 程序化登录；返回带 Authorization 头的 API 调用器 */
async function prepare(
  page: Page,
  request: APIRequestContext,
): Promise<{
  getService: () => Promise<ServiceRow>;
  putService: (name: string, ifMatch: string) => Promise<void>;
}> {
  await page.emulateMedia({ reducedMotion: "reduce" });

  const reset = await request.post("/api/__e2e/reset", { params: { now: EPOCH } });
  expect(reset.ok()).toBeTruthy();

  const login = await request.post("/api/auth/login", {
    data: { email: DEMO_EMAIL, password: "e2e-409" },
  });
  expect(login.ok()).toBeTruthy();
  const { token } = (await login.json()) as { token: string };
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
    TOKEN_KEY,
    token,
  ] as [string, string]);

  await page.clock.setFixedTime(EPOCH);

  const authHeaders = { authorization: `Bearer ${token}` };
  return {
    /** API 直读单条（另一上下文的取数视角） */
    getService: async () => {
      const res = await request.get(`/api/t/${TENANT}/services/${SERVICE_ID}`, {
        headers: authHeaders,
      });
      expect(res.ok()).toBeTruthy();
      return (await res.json()) as ServiceRow;
    },
    /** API 直改单条（另一上下文的写入视角：严格 If-Match） */
    putService: async (name, ifMatch) => {
      const res = await request.put(`/api/t/${TENANT}/services/${SERVICE_ID}`, {
        headers: { ...authHeaders, "if-match": ifMatch },
        data: { name },
      });
      expect(res.ok()).toBeTruthy();
    },
  };
}

test.describe("409 并发冲突：两人并发编辑同一资源", () => {
  test("他人抢先保存 → 本页提交 409 冲突提示 → 刷新取新版本 → 再提交成功", async ({
    page,
    request,
  }) => {
    const api = await prepare(page, request);

    // 0) 基线：服务端当前版本 V
    const before = await api.getService();
    expect(before.version).toBeGreaterThan(0);

    // 1) 打开编辑页：页面缓存版本 V（此后的他人修改不会进本页缓存）
    await page.goto(`/t/${TENANT}/services/${SERVICE_ID}/edit`);
    // getByRole(name) 走可访问名（Base UI Field 经 aria 关联，label 无 for 属性）
    const name = page.getByRole("textbox", { name: "名称", exact: true });
    await expect(name).toBeVisible();
    await expect(name).toHaveValue(before.name);

    // 2) 另一上下文（API 直改）抢先保存：服务端版本 V → V+1、名称被改
    const otherName = `${before.name}-他人已改`;
    await api.putService(otherName, String(before.version));

    // 3) 本页提交（仍带 If-Match: V）→ mock 严格乐观并发 → 409 → 统一冲突文案
    await page.getByRole("button", { name: "保存修改" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "记录已被他人修改，请刷新后重试" }),
    ).toBeVisible();
    // 冲突不丢现场：停留编辑页（提示引导刷新，而非静默覆盖或跳转）
    await expect(page).toHaveURL(/\/edit$/);

    // 4) 刷新（提示文案指向的动作）：表单回显他人版本（名称 = 他人已改；未触碰无草稿）
    await page.reload();
    await expect(name).toHaveValue(otherName);

    // 5) 闭环收口：基于新版本再提交 → 成功 → toast + 回详情页；服务端版本核实 V+2
    await page.getByRole("button", { name: "保存修改" }).click();
    await expect(page.getByText("已保存（版本 +1）")).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`/services/${SERVICE_ID}$`), { timeout: 15_000 });
    const after = await api.getService();
    expect(after.version).toBe(before.version + 2);
    expect(after.name).toBe(otherName);
  });
});
