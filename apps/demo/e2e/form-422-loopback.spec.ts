/**
 * 422 回填闭环（M7-C3，docs/paradigm.md §6-C3 / §1.2 传输凭证「错误信封」轴：422 必回填）。
 *
 * 链路一（services 新建表单——最短真实链路）：mock handler 内置服务端独有校验
 * 「名称含 taken → 422 { fields, form } 信封」（services.ts POST），客户端 zod 不含该
 * 规则——字段级回填只能来自服务端。闭环：提交含 taken 的合法名称 → 422 → 字段级错误
 * 回填展示（aria-invalid + 字段错误文本）+ 表单级提示 → 停留本页且保留输入 → 改正后
 * 再提交成功（toast + 回列表 + 新行可见）。
 *
 * 链路二（team 新邀请弹窗——模式预设宿主同款闭环）：提交「已有待处理邀请」的邮箱
 * （seed 固定 new-hire@fleetly.dev，客户端 zod 只验格式查不到重）→ 422 字段回填（email）
 * → 换邮箱再提交 → 成功进入待处理邀请区。
 *
 * chaos 派发器（?demo-error=）与字段级 422 正交（M7-B2 记录：chaos 返回通用 { message }
 * 信封，字段错误由 handler 内置业务规则产生）——本 spec 全程不经 chaos。
 *
 * 确定性三件套沿用 states-baseline.spec.ts 的 prepare() 惯例：
 * 冻结时钟（EPOCH）+ 禁动画（reducedMotion）+ 每测 mock 重置（POST /api/__e2e/reset）。
 */
import { type APIRequestContext, expect, type Page, test } from "@playwright/test";

const EPOCH = Date.parse("2026-10-23T08:00:00.000Z");
const DEMO_EMAIL = "demo@fleetly.dev";
const TOKEN_KEY = "demo:token";
const TENANT = "acme-web";

/** 确定性前提三件套 + 程序化登录；返回会话 token（API 直操作用） */
async function prepare(page: Page, request: APIRequestContext): Promise<{ token: string }> {
  await page.emulateMedia({ reducedMotion: "reduce" });

  const reset = await request.post("/api/__e2e/reset", { params: { now: EPOCH } });
  expect(reset.ok()).toBeTruthy();

  const login = await request.post("/api/auth/login", {
    data: { email: DEMO_EMAIL, password: "e2e-422" },
  });
  expect(login.ok()).toBeTruthy();
  const { token } = (await login.json()) as { token: string };
  await page.addInitScript(([key, value]) => localStorage.setItem(key, value), [
    TOKEN_KEY,
    token,
  ] as [string, string]);

  await page.clock.setFixedTime(EPOCH);
  return { token };
}

test.describe("422 回填闭环：services 新建表单（handler 内置服务端独有校验）", () => {
  test("taken 名称 → 字段级回填 → 原地修正 → 再提交成功", async ({ page, request }) => {
    await prepare(page, request);
    await page.goto(`/t/${TENANT}/services/new`);

    // getByRole(name) 走可访问名（Base UI Field 经 aria 关联，label 无 for 属性）
    const name = page.getByRole("textbox", { name: "名称", exact: true });
    await expect(name).toBeVisible();

    // 1) 提交服务端独有规则命中的名称：客户端 zod 合法（≥3 字符），422 只能来自服务端
    await name.fill("taken-checkout-api");
    await page.getByRole("button", { name: "创建服务" }).click();

    // 2) 422 字段级回填：错误落在名称字段位（FieldError + aria-invalid），输入保留
    await expect(page.getByText("该名称已被占用（服务端独有校验）")).toBeVisible();
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await expect(name).toHaveValue("taken-checkout-api");
    // 表单级提示（信封 form 段，FormMessage role=alert；FieldError 同为 alert 故按文本过滤）
    await expect(
      page.getByRole("alert").filter({ hasText: "请修正标记的字段后重试" }),
    ).toBeVisible();
    // 回填的意义：停留本页等用户原地修正，不清空不跳转
    await expect(page).toHaveURL(/\/services\/new$/);

    // 3) 闭环收口：改正后同一表单再提交成功 → toast + 回列表 → 新行可见
    await name.fill("e2e-422-closed-loop");
    await page.getByRole("button", { name: "创建服务" }).click();
    await expect(page.getByText("服务 e2e-422-closed-loop 已创建")).toBeVisible();
    await expect(page).toHaveURL(/\/services$/, { timeout: 15_000 });
    await page.goto(`/t/${TENANT}/services?q=e2e-422-closed-loop`);
    await expect(page.locator('[data-slot="data-table"]')).toContainText("e2e-422-closed-loop");
  });
});

test.describe("422 回填闭环：team 新邀请弹窗（模式预设宿主）", () => {
  test("重复待邀请邮箱 → email 字段回填 → 换邮箱成功", async ({ page, request }) => {
    await prepare(page, request);
    await page.goto(`/t/${TENANT}/team`);
    await expect(page.getByRole("heading", { name: "待处理邀请" })).toBeVisible();

    // 1) 打开邀请弹窗，提交 seed 固定的待处理邮箱（客户端 zod 只验格式，重查在服务端）
    await page.getByRole("button", { name: "邀请成员" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const email = dialog.getByRole("textbox", { name: "邮箱", exact: true });
    await email.fill("new-hire@fleetly.dev");
    await dialog.getByRole("button", { name: "发送邀请" }).click();

    // 2) 422 字段回填：email 字段错误 + 弹窗保持打开、输入保留
    await expect(dialog.getByText("该邮箱已有待处理邀请")).toBeVisible();
    await expect(email).toHaveValue("new-hire@fleetly.dev");

    // 3) 修正收口：换新邮箱再提交 → 成功 → 待处理邀请区出现新邮箱
    await email.fill("e2e-422-new@fleetly.dev");
    await dialog.getByRole("button", { name: "发送邀请" }).click();
    await expect(dialog).not.toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("e2e-422-new@fleetly.dev")).toBeVisible();
  });
});
