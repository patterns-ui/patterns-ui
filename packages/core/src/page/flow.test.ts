/**
 * defineFlow / createFlowMachine 单测（M7-A2，docs/core-api.md §17.4）。
 * headless：全部脱离渲染测试。覆盖：前进/回退/步骤间数据保留/转移校验失败路径
 * （校验不过不前进且错误可见）/异步校验/动作序列编排/配置失败路径。
 */
import { describe, expect, it, vi } from "vitest";
import type { Action } from "./actions";
import { createFlowMachine, defineFlow } from "./index";

describe("defineFlow（配置校验）", () => {
  it("失败路径：步骤 id 重复 → 报错列出全部步骤", () => {
    expect(() =>
      defineFlow({
        steps: [
          { id: "a", title: "A" },
          { id: "a", title: "A2" },
        ],
      }),
    ).toThrow(/id 重复「a」.*a, a/);
  });

  it("失败路径：转移目标缺失 → 报错列出合法步骤", () => {
    expect(() =>
      defineFlow({
        steps: [{ id: "a" }, { id: "b" }],
        transitions: [{ from: "a", to: "c" }],
      }),
    ).toThrow(/转移目标「c」不在步骤表.*\[a, b\]/);
  });

  it("失败路径：空步骤表", () => {
    expect(() => defineFlow({ steps: [] })).toThrow(/steps 不能为空/);
  });
});

describe("createFlowMachine（步骤状态机）", () => {
  it("前进/回退；步骤间数据保留（submitStep 合并、回退不清空）", async () => {
    const machine = createFlowMachine(
      defineFlow({
        steps: [{ id: "account" }, { id: "profile" }, { id: "done-step" }],
      }),
    );
    expect(machine.getState().stepId).toBe("account");

    machine.submitStep("account", { name: "Acme" });
    expect(await machine.next()).toBe(true);
    expect(machine.getState().stepId).toBe("profile");

    // 回退：数据保留
    expect(machine.back()).toBe(true);
    expect(machine.getState().stepId).toBe("account");
    expect(machine.getState().data.account).toEqual({ name: "Acme" });

    // 再次前进 + 第二步数据：两步数据并存
    expect(await machine.next()).toBe(true);
    machine.submitStep("profile", { timezone: "UTC" });
    expect(await machine.next()).toBe(true);
    expect(machine.getState()).toMatchObject({
      stepId: "done-step",
      data: { account: { name: "Acme" }, profile: { timezone: "UTC" } },
    });
  });

  it("失败路径：转移校验不过 → 不前进且错误可见", async () => {
    const machine = createFlowMachine(
      defineFlow({
        steps: [
          { id: "a" },
          {
            id: "b",
            validate: (data) =>
              (data.a as { ok?: boolean } | undefined)?.ok === true ? true : ["第一步未完成"],
          },
        ],
      }),
    );
    const ok = await machine.next();
    expect(ok).toBe(false);
    expect(machine.getState().stepId).toBe("a");
    expect(machine.getState().error).toEqual(["第一步未完成"]);

    machine.submitStep("a", { ok: true });
    expect(await machine.next()).toBe(true);
    expect(machine.getState().error).toEqual([]);
  });

  it("异步转移校验（可异步）+ 校验失败不前进", async () => {
    const machine = createFlowMachine({
      steps: [
        { id: "a" },
        {
          id: "b",
          validate: async () => {
            await new Promise((r) => setTimeout(r, 5));
            return ["服务端校验失败：邮箱已占用"];
          },
        },
      ],
    });
    expect(await machine.next()).toBe(false);
    expect(machine.getState().stepId).toBe("a");
    expect(machine.getState().error).toEqual(["服务端校验失败：邮箱已占用"]);
  });

  it("显式转移表：validate + actions（动作序列经宿主执行器编排）", async () => {
    const executed: string[] = [];
    const machine = createFlowMachine(
      {
        steps: [{ id: "a" }, { id: "b" }, { id: "c" }],
        transitions: [
          {
            from: "a",
            to: "c",
            validate: (data) => (data.a as { skip?: boolean } | undefined)?.skip === true,
            actions: [
              { name: "toast", payload: { message: "已跳到 C", variant: "success" } },
              { name: "navigate", payload: { to: "/c" } },
            ],
          },
        ],
      },
      {
        execute: (action) => {
          executed.push(action.name);
        },
      },
    );
    // 校验不过（skip !== true）：走显式转移失败 → 不前进
    expect(await machine.goTo("c")).toBe(false);
    // 顺序推进不受显式转移影响（a→b 无显式转移 = 顺序回落）
    expect(await machine.next()).toBe(true);
    expect(machine.getState().stepId).toBe("b");
    // 回 a 开通 skip，显式转移 a→c 成功且动作执行
    machine.back();
    machine.submitStep("a", { skip: true });
    expect(await machine.goTo("c")).toBe(true);
    expect(executed).toEqual(["toast", "navigate"]);
  });

  it("末步 next = 完成：末步校验未过 → 不完成、错误可见、动作不执行", async () => {
    const executed: string[] = [];
    const machine = createFlowMachine(
      defineFlow({
        steps: [{ id: "only", validate: () => ["末步校验未过"] }],
        actions: [{ name: "loading", payload: { on: false } }],
      }),
      {
        execute: (action) => {
          executed.push(action.name);
        },
      },
    );
    expect(await machine.next()).toBe(false); // 单步流：next 即完成路径，末步校验失败
    expect(machine.getState().status).toBe("idle");
    expect(machine.getState().error).toEqual(["末步校验未过"]);
    expect(executed).toEqual([]);
  });

  it("完成路径：done + 动作执行 + 词表外动作运行期拒绝", async () => {
    const executed: string[] = [];
    const machine = createFlowMachine(
      {
        steps: [{ id: "a" }],
        // @ts-expect-error 词表外动作名（Action 判别联合编译期拒绝；运行期路径由下一测覆盖）
        actions: [{ name: "navigat", payload: { to: "/" } } as Action],
      },
      {
        execute: (action) => {
          executed.push(action.name);
        },
      },
    );
    await expect(machine.next()).rejects.toThrow(
      /未知 action「navigat」.*navigate.*toast.*refresh.*invalidate.*refetch.*close.*reload.*copy.*waitDialog.*loading/s,
    );
    expect(machine.getState().status).toBe("idle"); // 完成动作失败 → 未标 done
    expect(executed).toEqual([]);
  });

  it("完成：合法动作序列执行 + status done", async () => {
    const executed: string[] = [];
    const machine = createFlowMachine(
      { steps: [{ id: "a" }], actions: [{ name: "close", payload: {} }] },
      {
        execute: (action) => {
          executed.push(action.name);
        },
      },
    );
    expect(await machine.next()).toBe(true);
    expect(machine.getState().status).toBe("done");
    expect(executed).toEqual(["close"]);
  });

  it("reset 回初始（数据可注入）；goTo 未知步骤报合法清单", async () => {
    const machine = createFlowMachine({
      steps: [{ id: "a" }, { id: "b" }],
      initialData: { seed: 1 },
    });
    machine.reset({ seed: 2 });
    expect(machine.getState().data).toEqual({ seed: 2 });
    await expect(machine.goTo("zzz")).rejects.toThrow(/未知步骤「zzz」.*\[a, b\]/);
  });

  it("订阅：状态变化通知（useSyncExternalStore 数据面）", async () => {
    const listener = vi.fn();
    const machine = createFlowMachine({ steps: [{ id: "a" }, { id: "b" }] });
    const unsubscribe = machine.subscribe(listener);
    machine.submitStep("a", { x: 1 });
    expect(listener).toHaveBeenCalled();
    unsubscribe();
    machine.submitStep("a", { x: 2 });
    expect(listener).toHaveBeenCalledTimes(1);
  });
});
