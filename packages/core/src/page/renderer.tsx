/**
 * page/renderer —— 名字解析出口与渲染器（docs/core-api.md §17.3）。
 *
 * 配置即源码、渲染器是编译目标：resolveBlock 把词表名解析为注入表中的组件
 * （名字不在表 → 报错列出注入域全表——报错信息即目录）；planPage 把 config + table
 * 编译为纯数据渲染计划（未知 slot → 报错列该原型合法 slot 清单）；renderPage/
 * PageRenderer 输出 ReactNode。core 自身不含任何 UI 组件——全部组件经 BlockTable 注入。
 */
import type { ComponentType, ReactNode } from "react";
import type { Archetype, BlockName } from "../vocab";
import { type BlockTable, SLOT_NAMES_BY_ARCHETYPE } from "./blocks";
import type { PageConfig } from "./define";

/** 名字 → 组件；名字不在注入表 → throw（报错列出该原型注入域全表） */
export function resolveBlock<A extends Archetype>(
  table: BlockTable<A>,
  archetype: A,
  name: string,
  // biome-ignore lint/suspicious/noExplicitAny: 注入组件 props 形态各异（与 BlockTable 注入值同宽）；core 不消费具体 props
): ComponentType<any> {
  const domain = Object.keys(table as Record<string, unknown>);
  // biome-ignore lint/suspicious/noExplicitAny: 同上（注入表读取的窄化形态）
  const component = (table as Record<string, ComponentType<any> | undefined>)[name];
  if (component === undefined) {
    throw new Error(
      `resolveBlock: 「${name}」不在 ${archetype} 注入表内；注入域（合法值）：[${domain.join(", ")}]——按原型分组注入子表，漏注入即编译错（core-api.md §17.1）`,
    );
  }
  return component;
}

/** 渲染计划（纯数据）：宿主 + 已解析 slot 组件 + 派生 props */
export interface PageRenderPlan {
  archetype: Archetype;
  // biome-ignore lint/suspicious/noExplicitAny: 注入组件 props 形态各异（与 BlockTable 注入值同宽）
  host: { name: BlockName; Component: ComponentType<any> };
  // biome-ignore lint/suspicious/noExplicitAny: 同上
  slots: { slot: string; name: BlockName; Component: ComponentType<any> }[];
  /** 宿主数据 props（config 除 host 外的透传 + slot 组件记录；纯数据，无 JSX/闭包） */
  props: Record<string, unknown>;
}

interface SlotSpec {
  slot: string;
  name: string;
}

/** 各原型「slot 字段 → 填充 block 名」读取器（SLOT_NAMES_BY_ARCHETYPE 的类型化伴生） */
function slotSpecsOf(archetype: Archetype, config: Record<string, unknown>): SlotSpec[] {
  const specs: SlotSpec[] = [];
  const push = (slot: string, name: unknown): void => {
    if (typeof name === "string" && name !== "") specs.push({ slot, name });
  };
  switch (archetype) {
    case "resource-list":
      push("toolbar", config.toolbar);
      push("filters", config.filters);
      push("view", (config.view as { name?: string } | undefined)?.name);
      push("empty", config.empty);
      break;
    case "resource-detail":
      push("header", config.header);
      push("timeline", config.timeline);
      break;
    case "resource-form":
      push("fields", config.fields);
      break;
    case "settings":
      for (const section of (config.sections as { content?: { block?: string } }[] | undefined) ??
        []) {
        push("sections", section?.content?.block);
      }
      break;
    case "overview":
      push("activity", config.activity);
      break;
    case "auth-flow":
      push("form", config.form);
      for (const step of (config.steps as { block?: string }[] | undefined) ?? []) {
        push("steps", step?.block);
      }
      break;
    case "wizard":
      for (const step of (config.steps as { block?: string }[] | undefined) ?? []) {
        push("steps", step?.block);
      }
      break;
  }
  return specs;
}

/** 非 slot 的公共数据键（PageConfigBase：宿主 PageHeader 消费；不参与越界判定） */
const PAGE_DATA_KEYS: readonly string[] = ["title", "description"];

/**
 * config + table → 渲染计划（纯数据）。失败路径（dev 可见，报错含合法值清单）：
 * 未知 slot 名 → throw 带 archetype 与合法 slot 清单；未知 block 名 → resolveBlock 目录式报错。
 */
export function planPage<A extends Archetype>(
  page: PageConfig<A>,
  table: BlockTable<A>,
): PageRenderPlan {
  const { archetype } = page as PageConfig<Archetype>;
  const config = (page as PageConfig<Archetype>).config as unknown as Record<string, unknown>;
  const legalSlots = SLOT_NAMES_BY_ARCHETYPE[archetype] as readonly string[];
  const legalKeys = [...PAGE_DATA_KEYS, ...legalSlots];
  for (const key of Object.keys(config)) {
    if (!legalKeys.includes(key)) {
      throw new Error(
        `planPage(${archetype}): 未知 slot「${key}」；合法 slot：[${legalSlots.join(", ")}]（原型 slot 结构见 paradigm.md §3.2）`,
      );
    }
  }
  const hostName = config.host;
  if (typeof hostName !== "string" || hostName === "") {
    throw new Error(`planPage(${archetype}): 缺 host；合法 slot：[${legalSlots.join(", ")}]`);
  }
  const hostComponent = resolveBlock(table as BlockTable<Archetype>, archetype, hostName);
  const slots = slotSpecsOf(archetype, config).map(({ slot, name }) => ({
    slot,
    name: name as BlockName,
    Component: resolveBlock(table as BlockTable<Archetype>, archetype, name),
  }));
  // 派生 props：config 除 host 外透传 + slot 组件记录（宿主按位装配）+ 动作序列原样传递
  const props: Record<string, unknown> = { ...config };
  delete props.host;
  props.slots = Object.fromEntries(slots.map((s) => [s.slot, s.Component]));
  return {
    archetype,
    host: { name: hostName as BlockName, Component: hostComponent },
    slots,
    props,
  };
}

/**
 * 渲染器（编译目标）：Host 收派生 props + 声明序 children（已解析 slot 组件）。
 * 宿主按 props.slots 记录做按位装配（A3 迁移时各宿主 block 增设对应消费位）。
 */
export function renderPage<A extends Archetype>(
  page: PageConfig<A>,
  table: BlockTable<A>,
): ReactNode {
  const plan = planPage(page, table);
  const Host = plan.host.Component;
  return (
    <Host {...plan.props}>
      {plan.slots.map(({ name, Component }) => (
        <Component key={name} data-block={name} />
      ))}
    </Host>
  );
}

/** renderPage 的组件形态（等价；供 JSX 宿主直用） */
export function PageRenderer<A extends Archetype>(props: {
  page: PageConfig<A>;
  table: BlockTable<A>;
  className?: string;
}): ReactNode {
  return renderPage(props.page, props.table);
}
