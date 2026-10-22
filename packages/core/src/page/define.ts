/**
 * page/define —— definePage 页面纯配置工厂（docs/core-api.md §17.2）。
 *
 * 配置类型按 paradigm §3.2 每原型的唯一 slot 结构收窄；slot 值引用词表名
 * （PageBlockNameFor<Archetype>），宿主（host）也是词表名。
 * 禁止 JSX 与无类型闭包（paradigm §3.4）；允许类型化非闭包值（zod schema、枚举表、
 * action 序列、校验器函数——校验器是纯数据校验，非 UI 闭包）。
 */

import { ARCHETYPES, type Archetype, type BlockName } from "../vocab";
import type { Action } from "./actions";
import type { PageBlockNameFor } from "./blocks";
import { SLOT_NAMES_BY_ARCHETYPE } from "./blocks";

/** 公共页面配置面（宿主 PageHeader 消费；纯数据） */
export interface PageConfigBase {
  title?: string;
  description?: string;
}

/** 校验 schema：zod v4（或任何 Standard Schema 实现）——与 resource.FormSchema 同约定 */
export type PageSchema = { readonly "~standard": unknown };

// ---------------------------------------------------------------------------
// resource-list（§3.2：toolbar / filters / view(table·grid·kanban·calendar) / rowActions / empty）
// ---------------------------------------------------------------------------

/** 行动作声明（动作序列走 action 词表；非 block） */
export interface RowActionConfig {
  id: string;
  label: string;
  danger?: boolean;
  actions: readonly Action[];
}

/** view slot：数据视图（table/grid 现有；kanban/calendar M8 词表就绪后追加） */
export interface ResourceListViewSlot {
  name: "data-table";
  variant?: "table" | "grid";
}

export interface ResourceListPageConfig extends PageConfigBase {
  /** 宿主：list-page 或模式预设 list 宿主（team-page/notification-inbox/global-search-page） */
  host: PageBlockNameFor<"resource-list">;
  /** toolbar slot（批量操作条 / 刷新条等） */
  toolbar?: PageBlockNameFor<"resource-list">;
  /** filters slot（过滤工具条 / facet 栏） */
  filters?: PageBlockNameFor<"resource-list">;
  /** view slot（host="list-page" 时必填：数据视图；模式预设宿主自带视图，可省） */
  view?: ResourceListViewSlot;
  /** 行动作声明（动作词表） */
  rowActions?: readonly RowActionConfig[];
  /** empty slot（空态填充） */
  empty?: PageBlockNameFor<"resource-list">;
}

// ---------------------------------------------------------------------------
// resource-detail（§3.2：header / tabs(sections·subResource·custom) / timeline / comments）
// ---------------------------------------------------------------------------

export interface ResourceDetailSectionConfig {
  title: string;
  items: { label: string; field: string; cell?: string }[];
}

export interface ResourceDetailTabConfig {
  id: string;
  label: string;
  kind: "sections" | "sub-resource" | "custom";
  /** kind:"sections" 的键值区 */
  sections?: readonly ResourceDetailSectionConfig[];
  /** kind:"sub-resource" 的子资源名 */
  resource?: string;
  /** kind:"custom" 登记名（词表域；与 core ResourceShowTab 登记制同构） */
  block?: BlockName;
  /** kind:"custom" 登记名（sandbox 域） */
  sandbox?: string;
}

export interface ResourceDetailPageConfig extends PageConfigBase {
  host: "detail-page";
  /** header slot（相邻跳转等 hero 位填充） */
  header?: PageBlockNameFor<"resource-detail">;
  /** tabs（三 kind；custom 走登记制） */
  tabs?: readonly ResourceDetailTabConfig[];
  /** timeline slot */
  timeline?: PageBlockNameFor<"resource-detail">;
  /** comments slot（M8 comment-thread 落地后开放） */
}

// ---------------------------------------------------------------------------
// resource-form（§3.2：fields / layout / submit；host: dialog·sheet·page）
// ---------------------------------------------------------------------------

export interface ResourceFormPageConfig extends PageConfigBase {
  /** 宿主 = 表单容器（三预设） */
  host: PageBlockNameFor<"resource-form">;
  /** fields slot（表单 widget 家族） */
  fields: "typed-form-field";
  /** 布局形态（非 block：单列 / 分区） */
  layout?: "single" | "sections";
  /** 提交后动作序列 */
  submit?: readonly Action[];
}

// ---------------------------------------------------------------------------
// settings（§3.2：sections[] 可扩展，计费/集成挂载点）
// ---------------------------------------------------------------------------

/** 预置节构件（settings-page 内置节的登记名；M7-A2 节化） */
export type SettingsSectionPreset = "org" | "profile" | "security" | "sessions" | "appearance";

export interface SettingsSectionConfig {
  id: string;
  label: string;
  /** 节描述（settings-page 节头右侧展示；缺省无） */
  description?: string;
  /** 图标名（宿主图标表解析；core 不含 UI） */
  icon?: string;
  /** 节内容：预置构件 或 词表 block 挂载位（扩展节：计费/集成等） */
  content: { preset: SettingsSectionPreset } | { block: PageBlockNameFor<"settings"> };
}

export interface SettingsPageConfig extends PageConfigBase {
  host: "settings-page";
  sections: readonly SettingsSectionConfig[];
}

// ---------------------------------------------------------------------------
// overview（§3.2：statCards / charts / activity；宿主 dashboard-page M8 波1）
// ---------------------------------------------------------------------------

export interface OverviewStatCardConfig {
  id: string;
  label: string;
  /** 静态值可省：动态计数（facets/query 派生）经 PageRenderer data 注入（M7-A3） */
  value?: string | number;
  trend?: string;
  tone?: "default" | "danger";
}

export interface OverviewChartConfig {
  id: string;
  title: string;
  kind: "line" | "bar" | "area";
}

export interface OverviewPageConfig extends PageConfigBase {
  /** 宿主域当前仅 stat-strip（dashboard-page 宿主 M8 波1 落地后扩域） */
  host: PageBlockNameFor<"overview">;
  statCards: readonly OverviewStatCardConfig[];
  charts?: readonly OverviewChartConfig[];
  activity?: PageBlockNameFor<"overview">;
}

// ---------------------------------------------------------------------------
// auth-flow（§3.2：steps 内嵌 / form / success；判别式：步骤含账号语义）
// ---------------------------------------------------------------------------

export interface AuthFlowStepConfig {
  id: string;
  /** 步骤承载 block（词表名：sign-in-page / otp-page / sign-up-page / forgot-password-page…） */
  block: PageBlockNameFor<"auth-flow">;
  /** 内嵌步骤（如 OTP 在登录内嵌完成——auth-flow 允许内嵌 step） */
  embedded?: boolean;
  /** 该步表单 zod schema（类型化非闭包） */
  schema?: PageSchema;
  /** 完成该步后的动作序列 */
  onDone?: readonly Action[];
}

/** 卡片下链接区（声明式：链接是页面结构决策，进配置；宿主渲染） */
export interface AuthFooterLinkConfig {
  label: string;
  to: string;
  /** 视觉档（对应既有 muted/primary 两类链接样式） */
  kind?: "muted" | "primary";
}

export interface AuthFlowPageConfig extends PageConfigBase {
  /**
   * 宿主：auth-card-layout 壳，或内嵌该壳的表单页 block（sign-in-page/sign-up-page/
   * otp-page/forgot-password-page——内嵌页不重复渲染壳，单表单页 steps 可省）
   */
  host: PageBlockNameFor<"auth-flow">;
  brand?: { name: string; logoUrl?: string; logoText?: string };
  steps?: readonly AuthFlowStepConfig[];
  /** form slot（整页表单形态的承载 block；与 steps 二选一） */
  form?: PageBlockNameFor<"auth-flow">;
  /** 成功终态（success slot：数据 + 动作序列） */
  success?: { title?: string; description?: string; actions?: readonly Action[] };
  /** 卡片下链接区（note 为链接前置说明文案） */
  footer?: { note?: string; links: readonly AuthFooterLinkConfig[] };
}

// ---------------------------------------------------------------------------
// wizard（§3.2：steps[] / transitions / actions；判别式：非账号语义的步骤流）
// ---------------------------------------------------------------------------

export interface WizardStepConfig {
  id: string;
  title: string;
  description?: string;
  /** 步骤内容 block（词表名） */
  block?: PageBlockNameFor<"wizard">;
  schema?: PageSchema;
}

export interface WizardTransitionConfig {
  from?: string;
  to: string;
  /** 转移校验（可异步；不过不前进） */
  validate?: (data: Record<string, unknown>) => boolean | string[] | Promise<boolean | string[]>;
  actions?: readonly Action[];
}

export interface WizardPageConfig extends PageConfigBase {
  host: PageBlockNameFor<"wizard">;
  steps: readonly WizardStepConfig[];
  transitions?: readonly WizardTransitionConfig[];
  /** 完成动作序列 */
  actions?: readonly Action[];
}

// ---------------------------------------------------------------------------
// definePage（按原型收窄的配置工厂）
// ---------------------------------------------------------------------------

/** 按原型分发配置类型（写错 slot 名/原型外 slot → 编译期拒绝） */
export type PageConfigFor<A extends Archetype> = A extends "resource-list"
  ? ResourceListPageConfig
  : A extends "resource-detail"
    ? ResourceDetailPageConfig
    : A extends "resource-form"
      ? ResourceFormPageConfig
      : A extends "settings"
        ? SettingsPageConfig
        : A extends "overview"
          ? OverviewPageConfig
          : A extends "auth-flow"
            ? AuthFlowPageConfig
            : A extends "wizard"
              ? WizardPageConfig
              : never;

/** definePage 产物：原型 + 收窄配置（渲染器/流引擎消费） */
export interface PageConfig<A extends Archetype = Archetype> {
  readonly archetype: A;
  readonly config: PageConfigFor<A>;
}

function assertArchetype(archetype: unknown): asserts archetype is Archetype {
  if (typeof archetype === "string" && (ARCHETYPES as readonly string[]).includes(archetype)) {
    return;
  }
  throw new Error(
    `definePage: 未知原型「${String(archetype)}」；合法值：[${ARCHETYPES.join(", ")}]（paradigm.md §3.2 七原型）`,
  );
}

/**
 * 页面纯配置工厂：原型收窄配置类型（0 JSX；配置即源码，渲染器是编译目标）。
 * 运行时兜底：原型词表校验（报错列 ARCHETYPES 全表）+ host 必填（JS 消费方防线；
 * 类型层 host 已是必填字面量）。
 */
export function definePage<A extends Archetype>(
  archetype: A,
  config: PageConfigFor<A>,
): PageConfig<A> {
  assertArchetype(archetype);
  const record = config as unknown as Record<string, unknown>;
  if (typeof record.host !== "string" || record.host === "") {
    throw new Error(
      `definePage(${archetype}): 缺 host（宿主 block 名；合法 slot：[${SLOT_NAMES_BY_ARCHETYPE[archetype].join(", ")}]）`,
    );
  }
  return { archetype, config } as PageConfig<A>;
}
