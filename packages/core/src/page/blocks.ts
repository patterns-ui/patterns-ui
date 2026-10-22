/**
 * page/blocks —— 按原型分组的注入子表类型层（docs/core-api.md §17.1）。
 *
 * 注入域 = BLOCKS_BY_ARCHETYPE[A]（宿主/预设，meta.archetype）∪ PAGE_SLOT_FILLS[A]
 * （该原型 slot 的内容填充 block，③ 词表实例层——宿主/预设外的 block 不带 meta.archetype，
 * 填充域在此单点维护，M7-B1 同原型 slot 结构 CI 校验消费同一张表）。
 * 禁止全量注入表（paradigm §3.3 决策记录：体积上限 = 词表全集）。
 */
import type { ComponentType } from "react";
import { type Archetype, BLOCKS_BY_ARCHETYPE, type BlockName } from "../vocab";

/**
 * 各原型的合法 slot 填充 block（不含宿主/预设——那部分来自 BLOCKS_BY_ARCHETYPE）。
 * 只追加不改名（词表纪律）；名字必须 ⊆ BLOCK_NAMES（type 层由 satisfies 保证）。
 */
export const PAGE_SLOT_FILLS = {
  "resource-list": [
    /** 过滤工具条（filter-bar）：搜索 + FilterDef 渲染 + 高级条件组。 */
    "filter-bar",
    /** 列表左侧 facet 栏（facet-sidebar）：字段分组多选 + 计数。 */
    "facet-sidebar",
    /** 表格视图（data-table）：TanStack Table v9 封装（view slot 的 table/grid 形态）。 */
    "data-table",
    /** 分页条（pagination-bar）：三形态（能力派生驱动）。 */
    "pagination-bar",
    /** 四态容器（async-state）：loading/empty/error/空过滤横切三态。 */
    "async-state",
    /** 空态（empty-state）：empty slot 默认填充。 */
    "empty-state",
    /** 批量操作条（selection-bar）：toolbar slot 批量动作位。 */
    "selection-bar",
    /** 刷新条（refresh-bar）：toolbar slot 手动/自动刷新位。 */
    "refresh-bar",
    /** 新数据提示条（new-items-banner）：轮询期新数据探测。 */
    "new-items-banner",
    /** 过滤感知导出（export-button）：toolbar slot 导出位。 */
    "export-button",
  ],
  "resource-detail": [
    /** 键值两列网格区（detail-grid）：sections tab 的内容件。 */
    "detail-grid",
    /** 垂直事件时间线（timeline）：timeline slot。 */
    "timeline",
    /** 危险操作区（danger-zone）：删除类高危动作位。 */
    "danger-zone",
    /** 上一条/下一条（record-pager）：header slot 相邻跳转。 */
    "record-pager",
    /** 外键显示（reference-field）：detail 字段外键解析。 */
    "reference-field",
    /** 四态容器（async-state）：横切三态。 */
    "async-state",
    /** 错误态（error-state）：横切 error 态。 */
    "error-state",
    /** 两版对比（diff-viewer）：变更对比位。 */
    "diff-viewer",
  ],
  "resource-form": [
    /** 表单 widget 全家（typed-form-field）：fields slot 的内容件。 */
    "typed-form-field",
  ],
  settings: [
    /** 危险操作区（danger-zone）：扩展节挂载位（如「删除组织」节）。 */
    "danger-zone",
  ],
  overview: [
    /** 统计卡行（stat-strip）：statCards slot 的内容件（dashboard-page 宿主 M8 波1）。 */
    "stat-strip",
  ],
  "auth-flow": [],
  wizard: [
    /** 表单 widget 全家（typed-form-field）：步骤表单内容件。 */
    "typed-form-field",
  ],
} as const satisfies { readonly [A in Archetype]: readonly BlockName[] };

/**
 * 注入域 = 宿主/预设（BlockNameFor<A>）∪ 内容填充（PAGE_SLOT_FILLS[A]）。
 * 经 PAGE_BLOCKS_BY_ARCHETYPE 的索引访问派生（见其注释：报错信息展开全表）。
 */
export type PageBlockNameFor<A extends Archetype> = (typeof PAGE_BLOCKS_BY_ARCHETYPE)[A][number];

/**
 * 注入域总表（宿主/预设 ∪ 内容填充）。展开为具名 spread + as const：PageBlockNameFor 经
 * 索引访问派生 → 写错名字的报错信息**展开全部合法值**（报错信息即目录，paradigm §3.3 (2)；
 * 别名直写的联合只显示别名与最近候选，不满足）。
 */
export const PAGE_BLOCKS_BY_ARCHETYPE = {
  "resource-list": [...BLOCKS_BY_ARCHETYPE["resource-list"], ...PAGE_SLOT_FILLS["resource-list"]],
  "resource-detail": [
    ...BLOCKS_BY_ARCHETYPE["resource-detail"],
    ...PAGE_SLOT_FILLS["resource-detail"],
  ],
  "resource-form": [...BLOCKS_BY_ARCHETYPE["resource-form"], ...PAGE_SLOT_FILLS["resource-form"]],
  settings: [...BLOCKS_BY_ARCHETYPE.settings, ...PAGE_SLOT_FILLS.settings],
  overview: [...BLOCKS_BY_ARCHETYPE.overview, ...PAGE_SLOT_FILLS.overview],
  "auth-flow": [...BLOCKS_BY_ARCHETYPE["auth-flow"], ...PAGE_SLOT_FILLS["auth-flow"]],
  wizard: [...BLOCKS_BY_ARCHETYPE.wizard, ...PAGE_SLOT_FILLS.wizard],
} as const satisfies { readonly [A in Archetype]: readonly BlockName[] };

/**
 * 按原型分组的注入子表（完整覆盖映射：漏注入任何一个合法名 = 宿主编译错——
 * typecheck 合法值域与注入表同域；paradigm §3.3 决策记录）。
 */
export type BlockTable<A extends Archetype = Archetype> = {
  // biome-ignore lint/suspicious/noExplicitAny: 宿主注入的 block 组件 props 形态各异（与 registry 组件等宽）；仅作注入值约束，禁止在 core 逻辑内消费具体 props
  readonly [K in PageBlockNameFor<A>]: ComponentType<any>;
};

/**
 * 各原型的唯一 slot 结构（合法 config 顶层键；paradigm §3.2）。
 * 运行时渲染器据此做越界防护：未知 slot → throw 带 archetype 与合法 slot 清单
 * （title/description 公共数据键单独放行，见 renderer PAGE_DATA_KEYS）。
 */
export const SLOT_NAMES_BY_ARCHETYPE = {
  "resource-list": ["host", "toolbar", "filters", "view", "rowActions", "empty"],
  "resource-detail": ["host", "header", "tabs", "timeline", "comments"],
  "resource-form": ["host", "fields", "layout", "submit"],
  settings: ["host", "sections"],
  overview: ["host", "statCards", "charts", "activity"],
  // brand 是 auth 卡片壳的数据键（非注入位），随 slot 清单一并纳入越界防护域
  "auth-flow": ["host", "steps", "form", "success", "brand"],
  wizard: ["host", "steps", "transitions", "actions"],
} as const satisfies { readonly [A in Archetype]: readonly string[] };
