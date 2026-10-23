/**
 * docs-data —— 文档生成器的编辑性内容单源（M7-C1，docs/paradigm.md §4、§6-C1）。
 *
 * 分工纪律（§3.4 一等公民：一份契约两种渲染同一来源，禁止只服务一方的手写副本）：
 *  - 词表节数据（block / cell / theme preset / action / 分页协议名）**不在本文件**——
 *    generate-docs.ts 直接 import core 源（vocab/blocks.generated.ts、page/actions、
 *    list 的 PAGINATION_MODES）与 registry/themes/*.json，改 meta 后 regen 即新，零手写副本；
 *  - 本文件只持有编辑性内容：AGENTS.md 路由层文案与三铁律（§4.1）、原型判定表（§3.2 口径）、
 *    判别式、每原型 2-3 精选组合（取材 demo 18 页真实组合）、反模式（与 eslint 四规则对齐）；
 *  - patterns.md 不手编：全部由 generate-docs.ts 注入生成；生成器对本文件做词表交叉校验
 *    （组合引用的 block 名 ⊆ BLOCK_NAMES、判定表原型序 = ARCHETYPES、分页协议描述闭集覆盖），
 *    编辑数据漂出词表即生成失败。
 */
import type { PaginationMode } from "../../packages/core/src/list/index";
import type { Archetype, BlockName } from "../../packages/core/src/vocab/blocks.generated";

// ---------------------------------------------------------------- AGENTS.md（路由层）

/**
 * AGENTS.md 路由层文案（§4.1：~10 行；生成器校验 ≤12 行且含 ui-page 引导）。
 * CLAUDE.md 是它的 symlink（Claude Code 仅当 CLAUDE.md 不存在时才读 AGENTS.md）。
 */
export const AGENTS_MD = {
  title: "# @patterns-ui — 页面工作路由",
  intro:
    "任何页面工作（建/改页面、选组件、品牌定制）先加载 `ui-page` skill（位于 `.zcode/skills/`、`.claude/skills/` 或 `.agents/skills/`，按你的宿主取其一）。",
  rulesTitle: "铁律（违反 = typecheck / eslint / CI 红）：",
  rules: [
    "1. 页面 = 配置不写 JSX：块 / cell / 动作只写词表内的名字，写错看 typecheck 报错列出的全表。",
    "2. 词表真缺组件走 sandbox 棘轮（`ui-block` skill）：登记 + 水印 + 查重 + 晋升，不私造轮子。",
    "3. 品牌定制只动 theme token（`ui-theme` skill）：hex 色值 / arbitrary tailwind / 逐组件改样式都是反模式。",
  ],
  footer:
    "事实层目录：docs/patterns.md（原型判定表 / 判别式 / 词表 / 精选组合 / 反模式）——生成物，勿手编（pnpm docs:generate）。",
} as const;

// ---------------------------------------------------------------- 原型判定表（§3.2 口径）

/** 原型判定表行：名字序 = ARCHETYPES（生成器校验）；宿主/现状为编辑口径，词表内宿主列由生成器注入 */
export interface ArchetypeRow {
  readonly name: Archetype;
  /** 唯一 slot 结构（同原型所有宿主/变体共享 slot 签名） */
  readonly slots: string;
  /** 宿主/变体说明（变体一律是 Layout 的 prop，不是平行 block） */
  readonly host: string;
  /** 现状（与 §3.2 表对齐，按已落地任务更新） */
  readonly status: string;
}

export const ARCHETYPE_TABLE: readonly ArchetypeRow[] = [
  {
    name: "resource-list",
    slots: "toolbar / filters / view(table·grid·kanban·calendar) / rowActions / empty",
    host: "list-page；view 为 prop",
    status: "✓（view 现 table·grid；kanban/calendar 待 M8）",
  },
  {
    name: "resource-detail",
    slots: "header / tabs(sections·subResource·custom) / timeline / comments",
    host: "detail-page",
    status: "✓（tabs 三 kind；custom 登记制已落地 M7-A2；comments 待 M8）",
  },
  {
    name: "resource-form",
    slots: "fields / layout / submit",
    host: "host: dialog·sheet·page 三宿主（form-dialog / form-sheet / form-page）",
    status: "✓（远期评估合并单 block + host prop——M8 波2）",
  },
  {
    name: "settings",
    slots: "sections[]（可扩展，计费/集成挂载位）",
    host: "settings-page",
    status: "✓（节化改造已落地 M7-A2）",
  },
  {
    name: "overview",
    slots: "statCards / charts / activity",
    host: "dashboard-page",
    status: "✗ M8 波1 补建（现仅 stat-strip 过渡）",
  },
  {
    name: "auth-flow",
    slots: "steps 内嵌 / form / success",
    host: "auth 卡片壳（auth-card-layout，四页共用）",
    status: "✓",
  },
  {
    name: "wizard",
    slots: "steps[] / transitions / actions",
    host: "stepper 宿主",
    status: "✓（action 词表已定义 M7-A2）",
  },
];

// ---------------------------------------------------------------- 判别式

export const DISCRIMINATORS = {
  /** auth-flow vs wizard 判别式（§3.2） */
  authVsWizard: [
    "步骤含账号语义（登录 / 注册 / 验证 / 找回密码）→ auth-flow；否则 wizard。",
    "auth-flow 允许内嵌 step（OTP 即 step）；wizard 的步骤是业务步骤，不含账号语义。",
  ],
  /** 横切三态说明（error/empty 不是原型） */
  crossCutting: [
    "**error/empty 不是原型**：loading / empty / error 是所有原型的横切三态，由 async-state 与 error-pages 共享 block 承担；每个 Layout 必接三态（ui:check 校验）。",
  ],
  /** 「唯一」约束的对象（§3.2） */
  uniqueSlots:
    "「唯一」约束的是 slot 结构：同原型的所有宿主/变体共享 slot 签名（registry meta 声明 archetype，CI 校验一致性）；变体一律是 Layout 的 prop，不是平行 block。",
} as const;

// ---------------------------------------------------------------- 每原型精选组合（取材 demo 18 页）

/** 精选组合：blocks 引用词表内名字（生成器校验 ⊆ BLOCK_NAMES——编辑数据不得漂出词表） */
export interface CuratedCombo {
  readonly archetype: Archetype;
  readonly title: string;
  readonly blocks: readonly BlockName[];
  /** 取材出处（demo 18 页或范式规划条目） */
  readonly source: string;
  readonly note?: string;
}

export const CURATED_COMBOS: readonly CuratedCombo[] = [
  // ---- resource-list
  {
    archetype: "resource-list",
    title: "services 列表（page 协议）",
    blocks: [
      "list-page",
      "filter-bar",
      "facet-sidebar",
      "data-table",
      "pagination-bar",
      "async-state",
      "empty-state",
      "selection-bar",
      "refresh-bar",
      "new-items-banner",
      "export-button",
    ],
    source: "apps/demo/src/pages/services-list.page.ts",
    note: 'resource-list-view 工厂一行装配；list.pagination.mode "page"（页码窗口可跳页）',
  },
  {
    archetype: "resource-list",
    title: "audit 列表（keyset 协议）",
    blocks: [
      "list-page",
      "facet-sidebar",
      "data-table",
      "pagination-bar",
      "async-state",
      "empty-state",
    ],
    source: "apps/demo/src/pages/audit.page.ts",
    note: "keyset 契约（cursor token 留内存不进 URL；append 日志 offset 漂移不可接受）",
  },
  {
    archetype: "resource-list",
    title: "模式预设宿主（team / 通知 / 搜索）",
    blocks: ["team-page", "notification-inbox", "global-search-page"],
    source: "apps/demo/src/pages/team.page.ts、notifications.page.ts、search.page.ts",
    note: 'definePage("resource-list", { host }) 换预设宿主，slot 结构不变',
  },
  // ---- resource-detail
  {
    archetype: "resource-detail",
    title: "services 详情（tabs 三 kind + 登记制）",
    blocks: ["detail-page", "record-pager", "confirm-dialog", "danger-zone"],
    source: "apps/demo/src/pages/services-detail.page.ts",
    note: "resource-detail-view 工厂；custom tab 与 dialog 走登记表（block 词表名 / sandbox 登记名）",
  },
  {
    archetype: "resource-detail",
    title: "概览节内联维护",
    blocks: ["detail-page", "inline-edit-field", "reference-field", "status-badge"],
    source: "apps/demo/src/pages/services-list.page.ts（def.show.sections）",
    note: "声明式 items（cell 名 + cellOptions）；inline-edit 保存接线由路由胶水注入",
  },
  {
    archetype: "resource-detail",
    title: "子资源指针空态",
    blocks: ["empty-state"],
    source: "apps/demo/src/pages/deployments.page.ts",
    note: "无独立列表端点的子资源页：空态 CTA 指回父资源（部署从服务详情触发）",
  },
  // ---- resource-form
  {
    archetype: "resource-form",
    title: "新建 / 编辑整页（分区表单）",
    blocks: ["form-page", "typed-form-field", "diff-viewer"],
    source: "apps/demo/src/pages/services-new.page.ts、services-edit.page.ts",
    note: "分区表单 + sticky 动作条 + 草稿自动保存；编辑页带变更摘要（diff-viewer）与 409 冲突演示",
  },
  {
    archetype: "resource-form",
    title: "创建 + 一次性密钥展示",
    blocks: ["form-dialog", "typed-form-field", "secret-reveal"],
    source: "apps/demo/src/pages/api-keys.page.ts",
    note: "M8 波1 api-key 模式预设落地前的手工组合形态（结构与文案单源在页面配置）",
  },
  {
    archetype: "resource-form",
    title: "详情动作开表单（对话框登记）",
    blocks: ["form-dialog"],
    source: "apps/demo/src/pages/services-detail.page.ts",
    note: 'heroActions kind "open-dialog" + dialogs 登记表；宿主三选一（dialog/sheet/page）按信息密度定',
  },
  // ---- settings
  {
    archetype: "settings",
    title: "内置五节",
    blocks: ["settings-page"],
    source: "apps/demo/src/pages/settings.page.ts",
    note: "sections[] 显式声明（org/profile/security/sessions/appearance 预置节构件）；数据与保存适配器经 PageRenderer data 注入",
  },
  {
    archetype: "settings",
    title: "扩展节挂载位",
    blocks: ["settings-page", "danger-zone"],
    source: "apps/demo/src/pages/tables.ts（settingsTable 注入）",
    note: "danger-zone 作为扩展节注入；计费 / 集成等扩展节同位挂载",
  },
  // ---- overview
  {
    archetype: "overview",
    title: "stat-strip 四卡概览（现状过渡形态）",
    blocks: ["stat-strip"],
    source: "apps/demo/src/pages/overview.page.ts",
    note: "statCards 声明四卡，值来自 services facets（data 注入）；摘要文案片段单源在页面配置",
  },
  {
    archetype: "overview",
    title: "dashboard-page 三 slot（M8 波1 规划形态）",
    blocks: ["stat-strip"],
    source: "docs/paradigm.md §3.2 / §7 波1",
    note: "statCards / charts / activity 三 slot 宿主待 M8 波1 补建（未入词表，不预写名字）；落地后本页收敛为工厂装配",
  },
  // ---- auth-flow
  {
    archetype: "auth-flow",
    title: "登录",
    blocks: ["auth-card-layout", "sign-in-page"],
    source: "apps/demo/src/pages/sign-in.page.ts",
    note: "提交适配器 makeSignInSubmit（login 成功后回跳 next）——类型化适配器引用，非 UI 闭包",
  },
  {
    archetype: "auth-flow",
    title: "OTP 验证码（内嵌 step）",
    blocks: ["auth-card-layout", "otp-page"],
    source: "apps/demo/src/pages/otp.page.ts",
    note: "auth-flow 允许内嵌 step（OTP 即 step）：6 位分格，填满自动提交",
  },
  {
    archetype: "auth-flow",
    title: "忘记密码（终态防枚举）",
    blocks: ["auth-card-layout", "forgot-password-page"],
    source: "apps/demo/src/pages/forgot.page.ts",
    note: "提交后固定「发送成功」终态，不暴露邮箱是否存在",
  },
  // ---- wizard
  {
    archetype: "wizard",
    title: "首登引导",
    blocks: ["onboarding"],
    source: "apps/demo/src/pages/onboarding.page.ts",
    note: 'definePage("wizard", { host: "onboarding" })：欢迎 → 创建首个资源 → 邀请成员 → 完成；步骤间数据保留',
  },
  {
    archetype: "wizard",
    title: "通用步骤流",
    blocks: ["stepper", "typed-form-field"],
    source: "apps/demo/src/pages/tables.ts（wizardTable 注入）",
    note: "stepper 宿主 + 步骤表单件；每步「下一步」前校验（可异步）、上一步回退",
  },
];

// ---------------------------------------------------------------- 分页协议（名字来自 core，说明为编辑口径）

/** 分页协议说明（key 与 core list 的 PAGINATION_MODES 闭集对齐——新协议无描述即生成失败） */
export const PAGINATION_PROTOCOL_DOCS: Record<
  PaginationMode,
  { semantics: string; ui: string; status: string }
> = {
  page: {
    semantics: "页码协议：请求携带 ?page=&size=；有服务端总数。",
    ui: "canJump → 允许渲染页码窗口。",
    status: "✓",
  },
  offset: {
    semantics: "裸行偏移：请求携带 offset 行数。",
    ui: "——",
    status:
      "未实现（词表合法值但声明即抛错——单一实现不预造协议；出现实现时按①象限变更纪律补齐引擎 + 能力 + 失败路径测试）",
  },
  keyset: {
    semantics:
      "游标协议（Relay connections / ES search_after / Stripe starting_after 等变体归一）；shape: paged（前后式）/ load-more（累计拼接）；cursor token 留内存不进 URL。",
    ui: "无 canJump，禁渲染页码窗口（能力派生而非 mode 直通 UI）。",
    status: "✓（audit 即此协议）",
  },
};

// ---------------------------------------------------------------- 反模式（与 eslint 四规则与 §3.5 对齐）

export interface AntiPattern {
  readonly pattern: string;
  readonly why: string;
  readonly instead: string;
  readonly enforcedBy: string;
}

export const ANTI_PATTERNS: readonly AntiPattern[] = [
  {
    pattern: "裸原语：`<table>` / `<dialog>` 家族",
    why: "横切三态（loading/empty/error）与 a11y（键盘导航、焦点回收）内建在 data-table / dialog 系 block 里，裸原语 = 绕过共享内核的一致性来源",
    instead: "用 data-table / form-dialog 等词表内 block；逐处例外须行尾登记注释",
    enforcedBy: "eslint no-raw-primitives（B1）",
  },
  {
    pattern: "hex 色值 / arbitrary tailwind 值（`bg-[#ff0000]`）",
    why: "色值脱离主题令牌，品牌定制无从下手、明暗态断裂",
    instead: "走 --status-* 等 theme token 与设计标度；品牌定制只动 themes/*.css token",
    enforcedBy: "eslint no-hex-arbitrary-tailwind + ui-theme skill",
  },
  {
    pattern: "页面写 JSX / 手工组装",
    why: "页面回流为代码堆叠，「对号入座」退化回「开放检索」，AI 与人失去同一契约",
    instead: "pages/*.page.ts 纯配置（definePage / defineResource / 视图工厂 spec + 类型化适配器）",
    enforcedBy: "eslint no-jsx-in-pages + M7-A3 验收 grep",
  },
  {
    pattern: "配置塞无类型闭包换「零 JSX」",
    why: "伪达标：配置可读性（人审得懂）是验收标准（§3.4）",
    instead: "类型化适配器引用（makeSignInSubmit 模式：依赖注入返回纯函数）",
    enforcedBy: "人工层配置可读性评审（C3 agent 验收）",
  },
  {
    pattern: "「这页很特殊」心态",
    why: "99% 不特殊；模式目录与七原型覆盖绝大多数 console 页（audit/team 特例已冻结为模式）",
    instead: "先查判定表与模式目录；真缺走 sandbox 棘轮（登记 + 水印 + 晋升）",
    enforcedBy: "ui-page skill 反模式节 + §3.2 判定表",
  },
  {
    pattern: "全量注入词表",
    why: "包体积上限 = 词表全集；「词表全量合法（typecheck）与注入子集（运行时）」两个世界打架（§3.3 决策记录）",
    instead: "按原型分组注入子表（pages/tables.ts）+ definePage<Archetype> 类型收窄",
    enforcedBy: "typecheck（漏注入即编译错）+ pnpm check:names",
  },
  {
    pattern: "私造轮子绕过词表 / 未登记 sandbox",
    why: "一致性衰减；sandbox 使用率健康指标失真（持续偏高 = 词表欠债）",
    instead: "blocks/sandbox/ 登记（开发态水印 + 相似度查重 + ui:promote 晋升不改名）",
    enforcedBy: "eslint 登记制 + ui-block skill",
  },
  {
    pattern: "改 registry item 名 / 路径 / targetDir",
    why: "消费端 registryDependencies 断链；词表「只追加不改名」同受约束（§1.2）",
    instead: "新名字追加，旧名字保留；只允许换 category",
    enforcedBy: "eslint registry-frozen + freeze 清单",
  },
];
