/**
 * bulk 部分失败（M7-C3，docs/paradigm.md §6-C3 / §1.2 写入一致「批量语义」轴：
 * 逐条语义 → 汇总一致 + undo 窗口）。
 *
 * 链路（services 批量删除 + mock 逐条语义，services.ts bulk-delete：stopped 状态
 * 拒删 409、其余成功——{ succeeded[], failed[] } 结果集）：
 *  1. API 预置确定性数据：把搜索 q=auth 命中的前两行分别置为 stopped（必失败腿）
 *     与 running（必成功腿）——不依赖种子权重的随机分布；
 *  2. UI 勾选两行 → 批量动作两段式确认（就地确认按钮）；
 *  3. undo 窗口行为：undoable toast（倒计时 + 撤销按钮）→ 点撤销 → 提示已撤销、
 *     两行恢复可见（未提交）；
 *  4. 再次批量删除并放行提交 → 汇总提示「成功 1，失败 1」→ 成功腿行消失、
 *     失败腿行仍在；API 核实服务端真相（stopped 行未删、running 行已删）。
 *
 * 汇总文案与 undo 交互来自 use-resource-mutations（core undoable 档 + sonner 倒计时）。
 *
 * 确定性三件套沿用 states-baseline.spec.ts 的 prepare() 惯例（冻结时钟只冻 Date，
 * undo 倒计时走真实定时器不受影响）。
 */
import { type APIRequestContext, expect, type Page, test } from "@playwright/test";

const EPOCH = Date.parse("2026-10-23T08:00:00.000Z");
const DEMO_EMAIL = "demo@fleetly.dev";
const TOKEN_KEY = "demo:token";
const TENANT = "acme-web";

/** 确定性前提三件套 + 程序化登录；返回带 Authorization 头的 API 调用器 */
async function prepare(
  page: Page,
  request: APIRequestContext,
): Promise<{
  listBySearch: (
    q: string,
  ) => Promise<{ id: string; name: string; status: string; version: number }[]>;
  setStatus: (id: string, status: "running" | "stopped", ifMatch: string) => Promise<void>;
}> {
  await page.emulateMedia({ reducedMotion: "reduce" });

  const reset = await request.post("/api/__e2e/reset", { params: { now: EPOCH } });
  expect(reset.ok()).toBeTruthy();

  const login = await request.post("/api/auth/login", {
    data: { email: DEMO_EMAIL, password: "e2e-bulk" },
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
    listBySearch: async (q) => {
      const res = await request.get(`/api/t/${TENANT}/services`, {
        params: { q, pageSize: "50" },
        headers: authHeaders,
      });
      expect(res.ok()).toBeTruthy();
      const body = (await res.json()) as {
        rows: { id: string; name: string; status: string; version: number }[];
      };
      return body.rows;
    },
    setStatus: async (id, status, ifMatch) => {
      const res = await request.put(`/api/t/${TENANT}/services/${id}`, {
        headers: { ...authHeaders, "if-match": ifMatch },
        data: { status },
      });
      expect(res.ok()).toBeTruthy();
    },
  };
}

/** 行选择：按名称文本定位行，勾选该行 checkbox（aria-label「选择该行」） */
async function selectRow(page: Page, rowName: string): Promise<void> {
  await page
    .locator('[data-slot="data-table"] tbody tr', { hasText: rowName })
    .getByRole("checkbox")
    .click();
}

/** 批量删除两段式确认（selection-bar 就地确认，3s 未确认自动复原） */
async function bulkDeleteConfirmed(page: Page): Promise<void> {
  await page.getByRole("button", { name: "批量删除" }).click();
  await page.getByRole("button", { name: "确认批量删除？" }).click();
}

test.describe("bulk 部分失败：批量删除部分成功部分失败", () => {
  test("undo 窗口可撤销；放行后汇总「成功 1 失败 1」且失败腿保留", async ({ page, request }) => {
    const api = await prepare(page, request);

    // 0) 确定性预置：q=auth 命中 8 行（auth-01..08）；前两行分别置 stopped（必失败）
    //    与 running（必成功）——种子权重分布与本测试解耦
    const rows = await api.listBySearch("auth");
    expect(rows.length).toBeGreaterThanOrEqual(2);
    const failLeg = rows[0];
    const okLeg = rows[1];
    if (failLeg === undefined || okLeg === undefined) {
      throw new Error(`seed 预期 q=auth ≥2 行，实际 ${rows.length}`);
    }
    await api.setStatus(failLeg.id, "stopped", String(failLeg.version));
    await api.setStatus(okLeg.id, "running", String(okLeg.version));

    await page.goto(`/t/${TENANT}/services?q=auth`);
    await expect(page.locator('[data-slot="data-table"]')).toBeVisible();
    const tableRows = page.locator('[data-slot="data-table"] tbody tr');
    await expect(tableRows).toHaveCount(rows.length);

    // ---- 第一轮：undo 窗口行为 ----
    await selectRow(page, failLeg.name);
    await selectRow(page, okLeg.name);
    await expect(page.locator('[data-slot="selection-bar"]')).toContainText("已选 2 项");

    await bulkDeleteConfirmed(page);

    // undoable toast：倒计时提示 + 撤销按钮 → 撤销 → 「已撤销」且两行仍在（未提交）
    const undoable = page.locator('[data-slot="undoable-toast"]');
    await expect(undoable).toBeVisible();
    await expect(undoable).toContainText(/内可撤销/);
    await page.getByRole("button", { name: /撤销（\d+s）/ }).click();
    await expect(page.getByText("已撤销，未提交变更")).toBeVisible();
    await expect(page.locator('[data-slot="data-table"]')).toContainText(failLeg.name);
    await expect(page.locator('[data-slot="data-table"]')).toContainText(okLeg.name);
    // 撤销 = 未提交：服务端两行仍在
    const afterUndo = await api.listBySearch("auth");
    expect(afterUndo.map((r) => r.id)).toEqual(expect.arrayContaining([failLeg.id, okLeg.id]));

    // ---- 第二轮：放行提交 → 部分失败汇总 ----
    await selectRow(page, failLeg.name);
    await selectRow(page, okLeg.name);
    await expect(page.locator('[data-slot="selection-bar"]')).toContainText("已选 2 项");
    await bulkDeleteConfirmed(page);

    // undo 窗口（5s + toast 余量）超时自动提交 → 汇总提示「成功 1，失败 1」
    await expect(page.getByText("批量删除：成功 1，失败 1")).toBeVisible({ timeout: 20_000 });

    // 失败腿保留、成功腿消失；API 核实服务端真相
    await expect(page.locator('[data-slot="data-table"]')).toContainText(failLeg.name);
    await expect(page.locator('[data-slot="data-table"]')).not.toContainText(okLeg.name);
    await expect(tableRows).toHaveCount(rows.length - 1);
    const truth = await api.listBySearch("auth");
    expect(truth.map((r) => r.id)).toEqual(expect.arrayContaining([failLeg.id]));
    expect(truth.map((r) => r.id)).not.toEqual(expect.arrayContaining([okLeg.id]));
  });
});
