// @vitest-environment happy-dom
/**
 * page 模块单测（M7-A2，docs/core-api.md §17）：注入子表解析 / definePage / 渲染计划 /
 * 渲染器 / action 词表封闭。失败路径硬指标：全部报错含「合法值清单」（报错即目录）。
 */
import { act, cleanup, render, renderHook, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import type { Archetype } from "../vocab";
import {
  ACTION_NAMES,
  type Action,
  type BlockTable,
  defineFlow,
  definePage,
  PAGE_BLOCKS_BY_ARCHETYPE,
  PageRenderer,
  planPage,
  renderPage,
  resolveBlock,
  runActions,
  useActionExecutor,
  useFlow,
} from "./index";

// ---------------------------------------------------------------------------
// 测试用注入组件（core 无 UI；组件全部注入）
// ---------------------------------------------------------------------------

function marker(text: string) {
  return ({ children }: { children?: ReactNode }) => (
    <section data-testid={text}>
      {text}
      {children}
    </section>
  );
}

/** auth-flow 注入子表（完整覆盖：五个宿主/预设 block 全部注入） */
const authTable: BlockTable<"auth-flow"> = {
  "auth-card-layout": marker("host:auth-card-layout"),
  "forgot-password-page": marker("forgot-password-page"),
  "otp-page": marker("otp-page"),
  "sign-in-page": marker("sign-in-page"),
  "sign-up-page": marker("sign-up-page"),
};

const settingsTable: BlockTable<"settings"> = {
  "settings-page": marker("host:settings-page"),
  "danger-zone": marker("danger-zone"),
};

// vitest globals 关闭 → testing-library 自动清理不生效，显式清理跨用例 DOM
afterEach(cleanup);

describe("resolveBlock（名字 → 组件）", () => {
  it("解析注入表中的名字", () => {
    const Component = resolveBlock(authTable, "auth-flow", "otp-page");
    expect(Component).toBeDefined();
    render(<Component />);
    expect(screen.getByTestId("otp-page")).toBeTruthy();
  });

  it("失败路径：名字不在表 → 报错列出注入域全表", () => {
    expect(() => resolveBlock(authTable, "auth-flow", "pagination-bar")).toThrow(
      /pagination-bar.*不在 auth-flow 注入表内.*auth-card-layout.*forgot-password-page.*otp-page.*sign-in-page.*sign-up-page/s,
    );
  });
});

describe("definePage（纯配置工厂）", () => {
  it("产出 { archetype, config }", () => {
    const page = definePage("auth-flow", {
      host: "auth-card-layout",
      title: "登录",
      steps: [{ id: "credentials", block: "sign-in-page" }],
      success: { actions: [{ name: "navigate", payload: { to: "/" } }] },
    });
    expect(page.archetype).toBe("auth-flow");
  });

  it("失败路径：原型词表外 → 报错列 ARCHETYPES 全表", () => {
    expect(() =>
      definePage("resource" as never, { host: "list-page", view: { name: "data-table" } } as never),
    ).toThrow(
      /未知原型.*resource-list.*resource-detail.*resource-form.*settings.*overview.*auth-flow.*wizard/s,
    );
  });

  it("失败路径：缺 host → 报错含合法 slot 清单", () => {
    expect(() => definePage("settings", { sections: [] } as never)).toThrow(
      /缺 host.*host.*sections/s,
    );
  });

  it("编译期：原型外 block 名挂进 slot → typecheck 拒绝（@ts-expect-error 锁定）", () => {
    definePage("settings", {
      host: "settings-page",
      // @ts-expect-error "list-page" 不在 settings 原型注入域（PageBlockNameFor<"settings"> 收窄）
      sections: [{ id: "x", label: "X", content: { block: "list-page" } }],
    });
    expect(true).toBe(true);
  });
});

describe("planPage（渲染计划）", () => {
  const signInPage = definePage("auth-flow", {
    host: "auth-card-layout",
    title: "登录",
    brand: { name: "Acme" },
    steps: [
      { id: "credentials", block: "sign-in-page" },
      { id: "otp", block: "otp-page", embedded: true },
    ],
    success: { title: "完成" },
  });

  it("host + slots 解析为组件；props 纯数据透传", () => {
    const plan = planPage(signInPage, authTable);
    expect(plan.host.name).toBe("auth-card-layout");
    expect(plan.slots.map((s) => s.name)).toEqual(["sign-in-page", "otp-page"]);
    expect(plan.props.title).toBe("登录");
    expect(plan.props.brand).toEqual({ name: "Acme" });
    // slots 记录按 slot 名收敛（同名多填充取末位；完整有序清单在 plan.slots / children）
    expect(Object.keys(plan.props.slots as object)).toEqual(["steps"]);
  });

  it("失败路径：原型外 slot（JS 消费方）→ 报错含该原型合法 slot 清单", () => {
    const smuggled = definePage("auth-flow", {
      host: "auth-card-layout",
      steps: [],
    });
    (smuggled.config as unknown as Record<string, unknown>).statCards = [];
    expect(() => planPage(smuggled, authTable)).toThrow(
      /未知 slot「statCards」.*host.*steps.*form.*success/s,
    );
  });
});

describe("渲染器（注入表 → 组件树）", () => {
  it("renderPage：Host 包裹声明序 slot children", () => {
    render(
      renderPage(
        definePage("auth-flow", {
          host: "auth-card-layout",
          steps: [
            { id: "credentials", block: "sign-in-page" },
            { id: "otp", block: "otp-page" },
          ],
        }),
        authTable,
      ) as ReactElement,
    );
    expect(screen.getByTestId("host:auth-card-layout")).toBeTruthy();
    const text = document.body.textContent ?? "";
    expect(text.indexOf("sign-in-page")).toBeGreaterThan(-1);
    expect(text.indexOf("otp-page")).toBeGreaterThan(text.indexOf("sign-in-page"));
  });

  it("PageRenderer：组件形态等价渲染", () => {
    render(
      <PageRenderer
        page={definePage("settings", {
          host: "settings-page",
          sections: [
            { id: "org", label: "组织", content: { preset: "org" } },
            { id: "danger", label: "危险区", content: { block: "danger-zone" } },
          ],
        })}
        table={settingsTable}
      />,
    );
    expect(screen.getByTestId("host:settings-page")).toBeTruthy();
    expect(screen.getByTestId("danger-zone")).toBeTruthy();
  });

  it("失败路径：空配置（无 host，JS 消费方）→ planPage 报缺 host", () => {
    const empty = { archetype: "settings", config: {} } as never;
    expect(() => planPage(empty, settingsTable)).toThrow(/缺 host/);
  });
});

describe("action 词表封闭（10 个，只追加）", () => {
  it("编译期：词表外名字 → @ts-expect-error 拒绝；运行期：报错列全表", async () => {
    // @ts-expect-error "navigat" 词表外（Action 判别联合编译期拒绝）
    const typo: Action = { name: "navigat", payload: { to: "/" } };
    await expect(runActions([typo], () => {})).rejects.toThrow(
      /未知 action「navigat」.*navigate.*toast.*refresh.*invalidate.*refetch.*close.*reload.*copy.*waitDialog.*loading/s,
    );
  });

  it("合法动作序列按声明序执行（词表校验先行）", async () => {
    const seen: string[] = [];
    await runActions(
      [
        { name: "toast", payload: { message: "已保存", variant: "success" } },
        { name: "navigate", payload: { to: "/t/acme/services" } },
        { name: "loading", payload: { on: false } },
      ],
      (action) => {
        seen.push(action.name);
      },
    );
    expect(seen).toEqual(["toast", "navigate", "loading"]);
  });

  it("ACTION_NAMES 与文档映射同域（词表纪律）", () => {
    expect(ACTION_NAMES).toHaveLength(10);
    expect(ACTION_NAMES).toContain("waitDialog");
  });

  it("useActionExecutor：默认执行器 navigate 降级 / toast 经注入回调", async () => {
    const toasts: string[] = [];
    const { result } = renderHook(() =>
      useActionExecutor({ toast: (p) => toasts.push(p.message) }),
    );
    // 无 RouterProvider 宿主：navigate 静默降级（useRouterAccess 同款），toast 走注入回调
    await act(async () => {
      await runActions(
        [
          { name: "navigate", payload: { to: "/x" } },
          { name: "toast", payload: { message: "已保存", variant: "success" } },
        ],
        result.current,
      );
    });
    expect(toasts).toEqual(["已保存"]);
  });
});

describe("useFlow（React 绑定）", () => {
  it("useSyncExternalStore 订阅：状态变化反映到 hook 结果", async () => {
    const cfg = defineFlow({ steps: [{ id: "a" }, { id: "b" }] });
    const { result } = renderHook(() => useFlow(cfg));
    expect(result.current.getState().stepId).toBe("a");
    await act(async () => {
      expect(await result.current.next()).toBe(true);
    });
    expect(result.current.getState().stepId).toBe("b");
    // 回退：数据保留语义（headless 测过，此处验证绑定透传）
    expect(result.current.back()).toBe(true);
    expect(result.current.getState().stepId).toBe("a");
  });
});

describe("BlockTable 完整覆盖（漏注入即编译错）", () => {
  it("编译期：缺 key → @ts-expect-error 锁定（typecheck 合法值域与注入表同域）", () => {
    // @ts-expect-error 缺 "sign-up-page"：BlockTable<"auth-flow"> 是完整覆盖映射（core-api §17.1）
    const incomplete: BlockTable<"auth-flow"> = {
      "auth-card-layout": marker("auth-card-layout"),
      "forgot-password-page": marker("forgot-password-page"),
      "otp-page": marker("otp-page"),
      "sign-in-page": marker("sign-in-page"),
    };
    expect(incomplete).toBeTruthy();
  });
});

/** 类型层冒烟：七原型 slot 结构类型可编译（PageConfigFor 分发正确） */
describe("类型层：七原型配置面", () => {
  it("各原型 definePage 配置类型收窄（含词表外拒绝由上文 @ts-expect-error 锁定）", () => {
    const listPage = definePage("resource-list", {
      host: "list-page",
      filters: "filter-bar",
      view: { name: "data-table", variant: "grid" },
      rowActions: [
        { id: "edit", label: "编辑", actions: [{ name: "toast", payload: { message: "x" } }] },
      ],
    });
    const formPage = definePage("resource-form", {
      host: "form-sheet",
      fields: "typed-form-field",
      layout: "sections",
      submit: [{ name: "close", payload: {} }],
    });
    const wizardPage = definePage("wizard", {
      host: "stepper",
      steps: [{ id: "s1", title: "来源", block: "typed-form-field" }],
      transitions: [{ from: "s1", to: "s2", validate: () => true }],
      actions: [{ name: "navigate", payload: { to: "/" } }],
    });
    expect([listPage.archetype, formPage.archetype, wizardPage.archetype]).toEqual([
      "resource-list",
      "resource-form",
      "wizard",
    ] satisfies Archetype[]);
  });
});

/** renderPage data 测试的记录组件（模块级：避免 hook 工厂 lint；记录到共享数组） */
const seen: Record<string, unknown>[] = [];
function RecorderHost(props: Record<string, unknown>) {
  seen.push({ where: "host", props });
  return props.children as ReactNode;
}
function RecorderSlot(props: Record<string, unknown>) {
  seen.push({ where: "slot", props });
  return null;
}

/** A3 域表扩展：模式预设 list 宿主进 resource-list 注入域；auth-flow footer 数据键合法 */
describe("PAGE_SLOT_FILLS 扩展（M7-A3）", () => {
  it("模式预设宿主（team/notification/search）在 resource-list 注入域内", () => {
    const domain = PAGE_BLOCKS_BY_ARCHETYPE["resource-list"] as readonly string[];
    for (const name of ["team-page", "notification-inbox", "global-search-page"]) {
      expect(domain).toContain(name);
    }
  });

  it("auth-flow：单表单页宿主（内嵌壳的 block）+ footer 数据键合法；host 联合收窄", () => {
    const page = definePage("auth-flow", {
      host: "sign-in-page",
      brand: { name: "Fleetly Console", logoText: "F" },
      footer: { links: [{ label: "注册账号", to: "/auth/sign-up", kind: "primary" }] },
    });
    // steps 可省（单表单页）；footer 不触发 slot 越界
    expect(() => planPage(page, authTable)).not.toThrow();
  });

  it("renderPage data：host/slot 附加 props 分发（运行时适配器注入面）", () => {
    const page = definePage("auth-flow", {
      host: "auth-card-layout",
      steps: [{ id: "signin", block: "sign-in-page" }],
    });
    seen.length = 0;
    const Host = RecorderHost;
    const Step = RecorderSlot;
    const table = {
      "auth-card-layout": Host,
      "sign-in-page": Step,
    } as unknown as BlockTable<"auth-flow">;
    render(
      renderPage(page, table, {
        host: { title: "欢迎回来" },
        slots: { steps: { onSubmit: () => undefined } },
      }) as ReactElement,
    );
    const host = seen.find((s) => s.where === "host")?.props as Record<string, unknown>;
    const slot = seen.find((s) => s.where === "slot")?.props as Record<string, unknown>;
    expect(host.title).toBe("欢迎回来");
    expect(slot.onSubmit).toBeTypeOf("function");
  });
});
