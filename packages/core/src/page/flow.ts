/**
 * page/flow —— flow 元模式（headless 步骤状态机，paradigm §1.2 / core-api.md §17.4）。
 *
 * 步骤机 / 转移 / 步骤间数据保留。headless：createFlowMachine 可脱离渲染测试；
 * useFlow 是 useSyncExternalStore 的 React 绑定。归入 ./page 子路径（不另开 ./flow）：
 * flow 是页面级元模式、definePage 的 step/transition 槽位直接消费 Action 类型，
 * 拆分子路径会让 A3 页面配置跨两个 import 面。
 */
import { useRef, useSyncExternalStore } from "react";
import {
  type Action,
  type ActionContext,
  type ActionExecutor,
  assertActionName,
  runActions,
} from "./actions";

/** 步骤流数据（步骤间保留：submitStep 合并、回退/前进不清空） */
export type FlowData = Record<string, unknown>;

/** 校验结果：true 通过；false = 通用阻断；string[] = 阻断且错误可见（错误清单） */
export type FlowValidateResult = boolean | string[];

export interface FlowStepConfig {
  id: string;
  title?: string;
  /** 步骤进入校验（可异步）：true 前进；false/string[] 阻断（错误进 state.error） */
  validate?: (data: FlowData) => FlowValidateResult | Promise<FlowValidateResult>;
  /** 进入该步动作序列（Action 词表，声明式编排） */
  onEnter?: readonly Action[];
}

export interface FlowTransitionConfig {
  /** 源步骤 id；缺省 = 任意源 */
  from?: string;
  /** 目标步骤 id */
  to: string;
  /** 转移校验（可异步）；不过不前进且错误可见（state.error） */
  validate?: (data: FlowData) => FlowValidateResult | Promise<FlowValidateResult>;
  /** 转移成功后的动作序列（声明式编排；执行器宿主注入） */
  actions?: readonly Action[];
}

export interface FlowConfig {
  /** 步骤表（id 唯一，defineFlow 校验） */
  steps: readonly FlowStepConfig[];
  /** 显式转移表；缺省 = 顺序推进（next/back 相邻步） */
  transitions?: readonly FlowTransitionConfig[];
  /** 完成动作序列（末步 next 触发；defineFlow({steps, transitions?, actions}) 的 actions 位） */
  actions?: readonly Action[];
  initialData?: FlowData;
}

export type FlowStatus = "idle" | "moving" | "done";

export interface FlowState {
  stepId: string;
  stepIndex: number;
  data: FlowData;
  status: FlowStatus;
  /** 最近一次转移校验失败信息（可见；成功转移清空） */
  error: string[];
}

export interface FlowMachine {
  getState(): FlowState;
  subscribe(fn: () => void): () => void;
  /** 步骤数据提交（保留：合并进 data，不覆盖其他步骤的数据） */
  submitStep(stepId: string, values: Record<string, unknown>): void;
  /** 前进（含校验）；false = 校验未过（不前进，error 已设置） */
  next(): Promise<boolean>;
  /** 回退（数据保留；首步返回 false） */
  back(): boolean;
  goTo(stepId: string): Promise<boolean>;
  reset(data?: FlowData): void;
}

/** 运行时选项：动作执行器注入（toast 回调 + 逐动作覆盖；core 不绑 router/toast 实现） */
export interface FlowRuntimeOptions {
  toast?: (payload: {
    message: string;
    variant?: "success" | "error" | "info" | "warning";
  }) => void;
  execute?: ActionExecutor;
}

function stepErrors(result: FlowValidateResult): string[] {
  if (result === true) return [];
  if (Array.isArray(result)) return result.filter((m) => typeof m === "string" && m !== "");
  return ["校验未通过"];
}

/** 校验配置：步骤 id 唯一、转移目标存在（报错列出全部步骤 id——报错即目录） */
function validateConfig(cfg: FlowConfig): void {
  if (cfg.steps.length === 0) throw new Error("defineFlow: steps 不能为空");
  const ids = cfg.steps.map((s) => s.id);
  const dup = ids.find((id, i) => ids.indexOf(id) !== i);
  if (dup !== undefined) {
    throw new Error(`defineFlow: 步骤 id 重复「${dup}」（steps：${ids.join(", ")}）`);
  }
  for (const t of cfg.transitions ?? []) {
    if (!ids.includes(t.to)) {
      throw new Error(`defineFlow: 转移目标「${t.to}」不在步骤表（合法值：[${ids.join(", ")}]）`);
    }
    if (t.from !== undefined && !ids.includes(t.from)) {
      throw new Error(`defineFlow: 转移源「${t.from}」不在步骤表（合法值：[${ids.join(", ")}]）`);
    }
  }
}

/** 步骤流定义工厂：纯校验（不建状态机）；配置即源码、可脱离渲染测试 */
export function defineFlow(cfg: FlowConfig): FlowConfig {
  validateConfig(cfg);
  return cfg;
}

async function runQuietly(
  actions: readonly Action[] | undefined,
  execute: ActionExecutor | undefined,
  ctx: ActionContext,
): Promise<void> {
  if (actions === undefined || actions.length === 0) return;
  // 词表校验先行（无执行器也拒绝词表外名字——运行期拒绝与执行解耦）
  for (const action of actions) assertActionName(action.name);
  if (execute === undefined) return;
  await runActions(actions, execute, ctx);
}

/** headless 状态机（可脱离渲染测试；订阅回调由 useFlow 接 useSyncExternalStore） */
export function createFlowMachine(cfg: FlowConfig, opts?: FlowRuntimeOptions): FlowMachine {
  validateConfig(cfg);
  const steps = cfg.steps;
  /** 索引读取（validateConfig 已保证非空表；越界防御性报错） */
  const stepAt = (index: number): FlowStepConfig => {
    const step = steps[index];
    if (step === undefined) throw new Error(`flow: 步骤索引越界（${index}）`);
    return step;
  };
  const firstStep = stepAt(0);
  const initial: FlowState = {
    stepId: firstStep.id,
    stepIndex: 0,
    data: { ...(cfg.initialData ?? {}) },
    status: "idle",
    error: [],
  };
  let state: FlowState = initial;
  const listeners = new Set<() => void>();
  const notify = (): void => {
    for (const fn of listeners) fn();
  };
  const setData = (patch: Partial<FlowState>): void => {
    state = { ...state, ...patch };
    notify();
  };
  const indexOf = (id: string): number => steps.findIndex((s) => s.id === id);
  /** 显式转移表优先（from 匹配或任意源）；顺序推进回落（相邻步无显式转移） */
  const transitionFor = (fromId: string, toId: string): FlowTransitionConfig | undefined =>
    (cfg.transitions ?? []).find(
      (t) => t.to === toId && (t.from === undefined || t.from === fromId),
    );

  const execute = opts?.execute;
  const ctx = (): ActionContext => ({ data: state.data });

  const goTo = async (stepId: string): Promise<boolean> => {
    const from = state;
    const targetIndex = indexOf(stepId);
    if (targetIndex < 0) {
      throw new Error(
        `flow: 未知步骤「${stepId}」；合法值：[${steps.map((s) => s.id).join(", ")}]`,
      );
    }
    const transition = transitionFor(from.stepId, stepId);
    const targetStep = stepAt(targetIndex);
    setData({ status: "moving", error: [] });
    // 转移校验（可异步）：显式转移的 validate + 目标步 validate（均不过不前进）
    const validators: Array<(data: FlowData) => FlowValidateResult | Promise<FlowValidateResult>> =
      [];
    if (transition?.validate) validators.push(transition.validate);
    if (targetStep.validate) validators.push(targetStep.validate);
    for (const validate of validators) {
      const errs = stepErrors(await validate(from.data));
      if (errs.length > 0) {
        setData({ status: "idle", error: errs });
        return false;
      }
    }
    try {
      await runQuietly(transition?.actions, execute, ctx());
      await runQuietly(targetStep.onEnter, execute, ctx());
    } catch (err) {
      setData({ status: "idle" });
      throw err;
    }
    setData({ stepId, stepIndex: targetIndex, status: "idle", error: [] });
    return true;
  };

  return {
    getState: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    submitStep(stepId, values) {
      // 步骤间数据保留：按步骤命名空间合并（不覆盖其他步骤数据）
      const slot = state.data[stepId];
      const prev = typeof slot === "object" && slot !== null ? (slot as FlowData) : {};
      setData({ data: { ...state.data, [stepId]: { ...prev, ...values } } });
    },
    async next() {
      const from = state;
      if (from.stepIndex >= steps.length - 1) {
        // 末步 next = 完成：末步校验 → 完成动作序列 → done
        setData({ status: "moving", error: [] });
        const final = stepAt(from.stepIndex);
        if (final.validate) {
          const errs = stepErrors(await final.validate(from.data));
          if (errs.length > 0) {
            setData({ status: "idle", error: errs });
            return false;
          }
        }
        try {
          await runQuietly(cfg.actions, execute, ctx());
        } catch (err) {
          setData({ status: "idle" });
          throw err;
        }
        setData({ status: "done", error: [] });
        return true;
      }
      return goTo(stepAt(from.stepIndex + 1).id);
    },
    back() {
      if (state.stepIndex === 0) return false;
      const target = stepAt(state.stepIndex - 1);
      // 回退不校验（数据保留；error 清空）
      setData({ stepId: target.id, stepIndex: state.stepIndex - 1, error: [] });
      return true;
    },
    goTo,
    reset(data) {
      state = { ...initial, data: { ...(data ?? cfg.initialData ?? {}) } };
      notify();
    },
  };
}

/**
 * React 绑定：useSyncExternalStore 订阅 headless 状态机。machine 以 cfg 引用为键缓存——
 * 配置即源码：宿主用 defineFlow 在模块级产出稳定引用（内联对象每渲染新建 = 每渲染新机，
 * 数据保留语义依赖模块级配置约定，A3 迁移遵循）。
 */
export function useFlow(cfg: FlowConfig, opts?: FlowRuntimeOptions): FlowMachine {
  const ref = useRef<{ cfg: FlowConfig; opts?: FlowRuntimeOptions; machine: FlowMachine } | null>(
    null,
  );
  if (ref.current === null || ref.current.cfg !== cfg || ref.current.opts !== opts) {
    ref.current = { cfg, opts, machine: createFlowMachine(cfg, opts) };
  }
  const { machine } = ref.current;
  useSyncExternalStore(machine.subscribe, machine.getState, machine.getState);
  return machine;
}
