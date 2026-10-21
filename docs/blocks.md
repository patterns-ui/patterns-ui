# Registry Blocks 规格

UI 层（copy-paste）全部 block 清单。命名 `kebab-case`；目录 = 类别；每个 block 一个目录：`registry/blocks/<category>/<name>/<name>.tsx` + `<name>.meta.json`。

通用约定：

- 样式只用 tailwind + token 语义类（`bg-background`/`text-muted-foreground`/`border`…），**禁止**硬编码色值（preset 兼容性要求）。
- 组件透传 props 用 Base UI `render` 惯例（不用 `asChild`）。
- 时间显示一律走 `@fleetly/ui-component-core/datetime`；状态色一律 `--status-*` token（经 `status-badge`）。
- 依赖标注：`ui:` = shadcn 基础件；`core:` = npm 包模块；`block:` = 其他 block（registryDependencies）。

## shell/ —— 应用壳

| block | 说明 | 关键 props | 依赖 |
|---|---|---|---|
| `app-shell-inset` | 侧栏 inset 面板式（默认）：内容区带边框圆角卡面 | `sidebar, topbar, children, fullBleed?` | ui: sidebar/sheet/tooltip；block: side-nav-inset |
| `app-shell-floating` | 浮动侧栏式（侧栏悬停浮起） | 同上 | block: side-nav-floating |
| `app-shell-fullbleed` | 满幅工作台（日志/终端类页面）：无内容卡面 | 同上（无卡面） | block: side-nav-inset |
| `top-bar` | 顶栏：SidebarTrigger + 面包屑 + 搜索入口(⌘K) + ThemeToggle + UserMenu | `onOpenSearch, user, onLogout, extra?` | block: breadcrumbs, theme-toggle, user-menu |
| `breadcrumbs` | 面包屑（core useCrumbs 派生） | `resolve?` | core: /router；ui: breadcrumb |
| `command-palette` | ⌘K 全局命令面板（导航跳转 + 动作） | `groups: { label, items: { id, label, icon?, keywords?, to?, run? }[] }[]` | ui: command/dialog；core: /router |
| `theme-toggle` | 明暗切换按钮（循环 light→dark→system） | — | core: /theme |
| `preset-switcher` | 主题 preset 切换下拉 | `presets: { id, label }[]` | core: /theme |
| `user-menu` | 用户菜单（头像+名+邮箱、登出、自定义项） | `user, onLogout, items?` | ui: dropdown-menu/avatar |
| `global-search-page` | 全局搜索结果页（⌘K 回车进入，跨资源搜索） | `resources: { name, label, search }[]` | core: /data；block: data-table |

## sidebar/ —— 侧栏

| block | 说明 | 关键 props | 依赖 |
|---|---|---|---|
| `side-nav-inset` | inset 形态侧栏（背景与内容区分层） | `groups: NavGroup[], tenantSlot?, footerSlot?` | ui: sidebar 系列 |
| `side-nav-floating` | floating 形态 | 同上 | 同上 |
| `side-nav-icon` | 可折叠至图标形态（折叠态 tooltip） | 同上 + `collapsible: 'icon'` | 同上 |
| `nav-group` | 分组导航（组标题 + 项 + badge + 权限过滤 + 折叠组） | `group: NavGroup, active` | ui: sidebar 子组件；core: /auth |
| `tenant-switcher` | 租户切换器（sidebar header 位；下拉列表 + 当前租户 + 陈旧回落提示） | —（core useTenant） | core: /tenant；ui: dropdown/avatar |
| `nav-user` | 侧栏底部用户卡（展开菜单） | `user, onLogout` | ui: sidebar 子组件 |

`NavGroup = { label?; items: NavItem[] }`，`NavItem = { to; label; icon?; badge?: { count: number; hot?: boolean }; canAccess? }`。active 判定：`pathname === to || startsWith(to + '/')`。

## list/ —— 列表

| block | 说明 | 关键 props | 依赖 |
|---|---|---|---|
| `list-page` | 列表页模板：页头(title/description/actions) + lead(stat-strip?) + FilterBar + AsyncState(DataTable) + PaginationBar + appendix | `title, description?, actions?, lead?, table, toolbar?, empty?` | block: stat-strip, filter-bar, async-state, pagination-bar |
| `data-table` | TanStack Table v9 封装：sticky 首尾列、列宽拖拽、列显隐/顺序菜单、密度切换、行选择、行操作菜单、展开行、分组/树形、聚合行、行内编辑、虚拟化、移动端卡片化、键盘(`/` 聚焦搜索由页面接线) | `table, stickyFirst?, stickyLast?, rowActions?, getRowId, expandable?: { render }, grouping?, tree?: { getChildren }, aggregates?: { field, fn }[], inline?: InlineCtl, virtual?: boolean, mobile?: 'cards', density persistence key` | core: /inline；ui: table/dropdown/checkbox；block: cells |
| `filter-bar` | 搜索框 + FilterDef 渲染 + and/or 组合编辑器(高级模式) + 已应用 chips + saved-views-menu + 刷新 | `state(来自 useResourceTable), defs, advanced?: boolean` | core: /filters,/list；block: saved-views-menu；ui: select/popover/badge |
| `facet-sidebar` | 列表左侧 facet 栏（多选 + 计数） | `facetData, state` | core: /filters；ui: checkbox |
| `saved-views-menu` | 命名视图下拉：保存当前/应用/重命名/删除 | `resourceKey` | core: /list(useSavedViews)；ui: dropdown |
| `pagination-bar` | 分页：offset 页码式 / cursor 前后式 / load-more 按钮 + pageSize 选择 + 总数展示 | `state, mode, totalRows?, isLoading` | ui: button/select |
| `selection-bar` | 批量操作条（已选 N + 动作组 + 清除） | `count, actions: { label, run, confirm?, danger? }[]` | ui: button/alert |
| `stat-strip` | 统计卡行（大数 tabular + 趋势/子说明） | `stats: { label, value, sub?, trend?: 'up'|'down', danger? }[]` | ui: card |
| `async-state` | 四态容器：loading(骨架)/error(重试)/empty(CTA)/filterEmpty(清除过滤)/data | `query, onRetry, empty?: { title, description, action? }, onClearFilters?, children` | block: empty-state, error-state, skeleton |
| `skeleton` | 骨架体系：table/detail/form/card 四形态 | `variant, rows?` | — |
| `refresh-bar` | 手动刷新 + 最后更新时间 + 自动刷新开关 | `query, intervalOptions?` | core: /datetime；block: relative-time |
| `new-items-banner` | "有 N 条新数据"提示条 | `signal(useNewItemsSignal), onRefresh` | ui: button |
| `notification-inbox` | 通知收件箱页（列表 + 已读/未读 + badge 数据源约定） | `resource(Notification 形状)` | core: /data；block: relative-time, cell-user |
| `export-button` | 过滤感知 CSV 导出（当前应用的状态取数导出） | `fetch: () => Promise<T[]>, columns, filename` | ui: button/dropdown |
| `use-resource-mutations` | createResource 消费层 helper：undoable 档 onUndoableToast 接 sonner（倒计时 Undo 按钮，提前关闭视为确认提交）；批量结果汇总（成功 N 失败 M） | `useResourceMutations(resource, { undoDurationMs?, successToast? })` → `{ useDeleteWithUndo, useBulkDeleteWithUndo, useBulkUpdate }` | core: /data,/mutation；npm: sonner |

## cells/ —— 语义渲染器（列表与详情共用）

每个 cell 一个小组件；另导出 `cellFor(def)` 映射器（L4 推断消费）。

| block | props | 说明 |
|---|---|---|
| `cell-id` | `value` | mono + 截断 + hover 复制 |
| `cell-time` | `value` | 时区感知；点击切换 相对↔绝对（偏好记忆） |
| `cell-status` | `value, map` | StatusBadge 别名映射（`{ running:'success', failed:'danger' }`） |
| `cell-user` | `user: { name, avatarUrl? } 或 id+resolve` | 头像 + 名（超 2 逗号截断） |
| `cell-boolean` | `value` | 布尔 → 图标/开关语义 |
| `cell-number` | `value, format?: 'int'\|'decimal'\|'percent'\|'bytes'` | tabular-nums + 单位 |
| `cell-enum-badge` | `value, options` | 值 → Badge 色 |
| `cell-tags` | `values, max?` | 标签组（超出 +N） |
| `cell-progress` | `value(0-100) 或 {current,total}, state?` | 进度条 + 可选状态色 |

## show/ —— 详情

| block | 说明 | 关键 props | 依赖 |
|---|---|---|---|
| `detail-page` | 详情页模板：返回链 + hero(头像/图标+标题+状态+actions) + tabs(深链) + sections/子资源 | `title, backTo, status?, actions?, tabs, heroMeta?` | block: detail-grid, timeline；ui: tabs |
| `detail-grid` | 键值两列区（复用 cells 渲染） | `items: { label, field, cell? }[], data` | block: cells |
| `timeline` | 事件时间线（三态：done/running/waiting） | `items: { title, at, state, detail? }[]` | core: /datetime |
| `reference-field` | 外键显示（异步解析 label） | `resource, id` | core: /reference；block: cell-user 可选 |
| `inline-edit-field` | 点击即改字段（轻编辑） | `value, onSave, type?` | ui: input |
| `danger-zone` | 危险操作区（底部红框卡） | `actions: { label, description, confirm, danger, run }[]` | block: confirm-dialog |
| `record-pager` | 上一条/下一条（基于来源列表 query 的相邻记录） | `listQuery, currentId, to` | core: /list |
| `diff-viewer` | JSON/text 两版对比 + 表单变更摘要 | `before, after, mode?` | — |

## form/ —— 表单

| block | 说明 | 关键 props | 依赖 |
|---|---|---|---|
| `form-page` | 整页表单宿主：页头(返回/标题/动作) + 分区表单(左侧标题右侧字段) + 底部动作条 | `title, backTo?, sections?, children, footer` | ui: card/button |
| `form-sheet` | 抽屉宿主（复杂表单） | `open, onOpenChange, title, width?` | ui: sheet |
| `form-dialog` | 弹窗宿主（小表单/创建） | `open, onOpenChange, title, size?` | ui: dialog |
| `typed-form-field` | TanStack Form 绑定字段（`createFormHook` 组合 + `useFieldContext`）+ 字段 widget 库：text/textarea/number/select/multi-select/tags/switch/date/date-range/secret(一次性)/kv-pairs(键值对)/upload(拖拽+进度)/json/repeatable-rows(数组行)/conditions(显隐联动) | `AppField` 组件集 + `createTypedForm()` 工厂 | core: /form；ui: input/select/switch/… |
| `reference-select` | 关联选择（搜索触发 + 分页选项 + 就地新建） | 见 core-api §4 | core: /reference；block: form-dialog |
| `stepper` | 分步向导（每步校验 + 步骤状态 + 完成 summary） | `steps: { title, fields?, validate? }[]` | ui: button |
| `confirm-dialog` | 确认框：普通 + type-to-confirm 高危变体 | `open, onOpenChange, title, description, danger?, typeToConfirm?: string, onConfirm, pending?` | ui: dialog |
| `secret-reveal` | 一次性密钥展示流（创建成功后展示一次 + 复制 + 警示） | `secret, onDone` | block: copy-button |

## auth/ —— 认证页

| block | 说明 | 依赖 |
|---|---|---|
| `sign-in-page` | 登录（品牌位 + 表单 + 错误展示 + next 回跳） | block: form-dialog 风格的 field；core: /auth |
| `sign-up-page` | 注册 | 同上 |
| `forgot-password-page` | 忘记密码（发送成功态） | 同上 |
| `otp-page` | MFA/验证码输入（6 位分格） | 同上 |

## team/ · settings/ —— SaaS 模板页

| block | 说明 | 依赖 |
|---|---|---|
| `team-page` | 成员表(角色/状态/2FA) + 邀请流(邮件/角色/链接复制) + 改角色/移除 + 待处理邀请区 | block: data-table, confirm-dialog, cells |
| `audit-log` | 审计日志预设（keyset 分页 + 时间范围 + actor 过滤 + 事件 chips + load-more） | block: data-table, filter-bar, cells |
| `settings-page` | 三分节设置壳（org/个人/安全）+ 时区偏好 + 主题与 preset 选择 | block: form-page 风格分区；core: /datetime,/theme |
| `onboarding` | 带逻辑的引导向导（stepper + 每步表单 + 完成跳转） | block: stepper, typed-form-field |
| `error-pages` | 403/404/500/路由级 error-boundary 四页面 | ui: button |

## shared/ —— 基础公共件

| block | 说明 |
|---|---|
| `status-badge` | 状态徽章：`tone: success/warning/danger/info/neutral`、`pulse?`（live）。**全库状态色单源** |
| `empty-state` | 空态（图标 + 标题 + 描述 + 可选 CTA） |
| `error-state` | 错误态（HttpError 分档文案：401/403/404/409/5xx/网络 + 重试） |
| `relative-time` | 相对时间（useNow 活渲染，title 显示绝对） |
| `copy-button` | 复制按钮（成功反馈 2s） |
| `user-avatar` | 头像（图/名首字母）+ 堆叠 `AvatarStack` |
| `resource-icon` | 资源类型 → 图标/颜色映射（`<ResourceIcon kind="service" />`，映射表可注入） |

## themes/ —— 主题 preset

`registry/themes/<preset>.json`：`{ name, label, cssVars: { light: {...}, dark: {...} } }`。构建生成 `registry:theme` item（cssVars + 附带 `[data-preset]` CSS）。首发：`default`（近黑中性 + indigo 强调）、`aurora`（浅色为主 + teal 强调）。default 的 token 基线见 architecture.md §8。

## 与 core 的边界（验收检查）

blocks 不得包含：数据请求逻辑（一律 core hooks）、时间/时区计算、状态色硬编码、路由抽象。blocks 允许包含：视觉、布局、交互编排（弹窗/抽屉时序）、对 core hooks 返回值的消费。
