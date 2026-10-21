# 里程碑任务分解与验收清单

执行方式：每阶段派子代理实现 → 按本文验收清单审核 → 通过后 `git commit + push` → 进入下一阶段。通用验收项（每阶段都查）：`pnpm lint`、`pnpm test`、`pnpm build` 全绿；无越界 import（architecture.md §2 依赖规则）；无硬编码色值。

---

## M0 —— 骨架

**任务**

1. pnpm monorepo：`pnpm-workspace.yaml`（`packages/*`、`apps/*`）+ catalog 管理共享依赖版本；根 `package.json` 脚本（dev/build/test/lint/registry:build/typecheck）。
2. `tsconfig.base.json`（strict、`@types/react` 等）；每包继承。biome 初始化并配置（含 import 排序、禁止 `any` 豁免清单留空）。
3. `packages/core` 空壳：package.json（name `@fleetly/ui-component-core`、peerDeps、exports 子路径骨架）、tsup 配置、`src/index.ts` 占位、vitest 就位。
4. `apps/demo`：Vite + React 19 + TanStack Router 文件路由（@tanstack/router-plugin，autoCodeSplitting）+ Tailwind v4 + TanStack Query；`shadcn init`（Base UI 方言）装基础件；`src/routes/index.tsx` 欢迎页。
5. **alias 消费链**：demo tsconfig paths + vite alias 加 `@/components/blocks/* → ../../registry/blocks/*`；在 `registry/blocks/shared/` 放一个样例 block（`status-badge`），demo 页面引用它渲染成功。
6. `registry/scripts/build.ts` 最小版：扫 meta.json → 内联源码 → 生成 `registry.json` + `dist/r/*.json`；`pnpm registry:build` + `shadcn registry validate` 通过。
7. `.gitignore`（node_modules/dist 等）、GitHub 无需 CI（M5 再加）。

**验收清单**

- [ ] `pnpm install && pnpm lint && pnpm build` 全绿
- [ ] `pnpm dev` 起 demo，页面渲染 status-badge 样例 block（含 tailwind 样式生效）
- [ ] `pnpm registry:build` 产物存在且 `shadcn registry validate` 通过
- [ ] core 包 `pnpm --filter @fleetly/ui-component-core build` 产出 ESM + dts
- [ ] catalog 生效：react/react-dom/@tanstack/* 版本单一来源
- [ ] git 提交：`feat(m0): monorepo skeleton, registry pipeline, demo alias chain`

---

## M1 —— 壳与横切

**任务（core）**

1. `theme/`：ThemeProvider（next-themes data-theme + data-preset + localStorage 'fc:preset' + 防闪阻塞脚本助手）+ useTheme。
2. `tenant/`：TenantProvider/useTenant/setTenant（保路径导航）/记忆校正/rootTenantRedirect/invalidateTenantCache。
3. `auth/`：AuthProvider 约定/useAuth/requireAuth/requireRole/useCan(filterNavByCan)。
4. `router/`：useCrumbs（staticData.title + 租户段反查）。
5. `datetime/`：useDateTimePrefs/formatAbsolute/formatRelative/useNow（Intl 缓存）。

**任务（registry blocks）**

6. `themes/`：default preset（token 基线见 architecture.md §8）+ aurora preset；theme item 构建支持。
7. shadcn 基础件补齐（sidebar 全套、dropdown、avatar、breadcrumb、tooltip、dialog、command 等，demo 内 `shadcn add`）。
8. shell 系：`app-shell-inset/-floating/-fullbleed`、`top-bar`、`breadcrumbs`、`theme-toggle`、`preset-switcher`、`user-menu`、`command-palette`。
9. sidebar 系：`side-nav-inset/-floating/-icon`、`nav-group`（badge/权限/折叠）、`tenant-switcher`、`nav-user`。
10. auth 系：`sign-in-page`、`sign-up-page`、`forgot-password-page`、`otp-page`。
11. `error-pages`（403/404/500/boundary）。
12. shared：`status-badge`（正式版）、`empty-state`、`error-state`、`relative-time`、`copy-button`、`user-avatar`、`resource-icon`。

**任务（demo）**

13. mock API 第一批：`POST /api/auth/login`（token）、`GET /api/me`、401 触发；`GET /api/orgs`（租户列表）。
14. 路由：`/auth/sign-in|sign-up|forgot|otp`；`_shell.tsx`（AppShell + requireAuth）；`_shell/index.tsx`（记忆租户重定向）；`_shell/t.$tenantId.tsx`（TenantProvider）；`_shell/t.$tenantId/index.tsx` 概览页（stat-strip 占位 + 租户名）；settings 页雏形（时区/主题/preset 切换可操作）。

**验收清单**

- [ ] 未登录访问壳路由 → 跳 sign-in 带 next；登录成功回跳
- [ ] 登录进入壳：inset 侧栏 + 分组导航 + 面包屑（含租户名反查）+ ⌘K 面板可导航
- [ ] 租户切换：URL 前缀替换、其余路径保留、旧租户缓存清除；记忆重定向与陈旧回落正确
- [ ] 三套 shell × 三套 sidebar 可在 demo 切换预览；侧栏折叠态 cookie/持久化
- [ ] 主题：dark 默认、light 切换、preset 切换（default/aurora）即时生效且刷新保持，无闪白
- [ ] 时区偏好切换后全 demo 时间显示变化；relative-time 活渲染
- [ ] 401（mock 触发）→ 清态回登录
- [ ] `pnpm registry:build` + validate 通过；blocks 无硬编码色值
- [ ] git 提交：`feat(m1): shell, sidebars, auth pages, tenant/theme/datetime core`

---

## M2 —— 列表纵切（最重）

**任务（core）**

1. `data/`：全部契约类型 + HttpError + createResource（queryKey/失效/mutationMode 三档含 undoable 时序）。
2. `filters/`：FilterDef/FilterTree + applyFilterTree + URL 编解码 + diffFilters。
3. `list/`：useResourceTable 四模式（client/server-offset/server-cursor/load-more）+ createListSearchSchema + useSavedViews。
4. `task/` 的 useNewItemsSignal。

**任务（registry blocks）**

5. cells 全套（9 件）+ `cellFor`。
6. `skeleton`、`async-state`（四态）、`stat-strip`、`status-badge` 已有。
7. `data-table`：sticky 首尾列、列宽拖拽 + 列显隐/顺序/密度（localStorage 偏好）、行选择、行操作菜单、展开行、键盘导航钩子。虚拟化/分组/树形/聚合/行内编辑/移动卡片化（M4 高级模式，本阶段留接口）。
8. `filter-bar`（搜索 + defs 渲染 + chips + 高级 and/or 编辑器）、`facet-sidebar`、`saved-views-menu`、`pagination-bar`（三形态）、`selection-bar`、`refresh-bar`、`new-items-banner`、`export-button`、`list-page`（table 变体）。

**任务（demo + mock）**

9. mock：services（offset：page/pageSize/sort/filters/search/facets，种子 ≥ 120 行保证翻页）、audit-events（keyset + facet + and/or 过滤，时间范围）；批量删除/更新；错误触发参数（401/403/500）。
10. demo 适配器：`src/lib/clients.ts` 实现 ResourceClient（fetch + token + HttpError 映射）。
11. 页面：`t.$tenantId/services.index`（完整列表页：搜索/过滤(facet+高级)/多列排序/页码分页/列偏好/行选择批量/导出/命名视图/刷新轮询/新数据条/四态）；`t.$tenantId.audit`（cursor + load-more 双形态切换演示）。

**验收清单**

- [ ] services 页：过滤器/排序/页码/搜索全部反映在 URL；复制 URL 新开完整还原；后退前进正确
- [ ] 过滤变化回第 1 页；搜索防抖；多列排序 URL `sort=a:asc,b:desc`
- [ ] facet 计数与勾选联动；chips 一键移除；高级模式 or 组合生效（audit 页验证）
- [ ] 命名视图：保存/应用/重命名/删除，应用后 URL 与视图一致
- [ ] 批量删除走 SelectionBar + confirm；结果汇总（成功 N 失败 M）
- [ ] CSV 导出内容与当前过滤/排序一致
- [ ] cursor 模式前进后退用 token 栈无重复请求；load-more 累计拼接
- [ ] 轮询开启后新数据出现 banner 计数，确认后刷新
- [ ] 四态全部可触发（loading 骨架/空数据/空过滤/错误重试）
- [ ] undoable 删除：立即消失 + toast 倒计时撤销恢复
- [ ] core 单测起步：filters 求值器、URL 编解码往返、createResource queryKey/失效（后续 M5 补全）
- [ ] git 提交：`feat(m2): resource data layer, list state machine, full list blocks`

---

## M3 —— 表单、详情与关联

**任务（core）**

1. `form/`：useResourceForm（edit 取数/错误映射/409/autosave 草稿/redirect）+ useFormDirtyGuard。
2. `reference/`：useReference + 选项加载约定。
3. `task/`：useTaskSubmit/useTaskPoll。

**任务（registry blocks）**

4. `typed-form-field`：createFormHook 组合 + 字段 widget 全家（text/textarea/number/select/multi/tags/switch/date/date-range/secret/kv-pairs/upload/json/repeatable-rows/条件显隐）+ `createTypedForm()` 工厂。
5. 三宿主：`form-page`（分区布局）/`form-sheet`/`form-dialog`；`stepper`（含 summary）；`confirm-dialog`（含 type-to-confirm）；`reference-select`；`secret-reveal`。
6. show 系：`detail-page`（hero/tabs 深链/子资源 tab）、`detail-grid`、`timeline`、`reference-field`、`inline-edit-field`、`danger-zone`、`record-pager`、`diff-viewer`。

**任务（demo + mock）**

7. mock：create/update（422 字段错误、409 冲突版本）、deployments 子资源（serviceId 作用域）、长任务（POST 触发 → task 状态机 queued→running→succeeded，2-4s）、api-keys（create 返回一次性 secret）。
8. 页面：`services.$id`（详情：hero + tabs[概览/部署/设置] + 部署子资源 tab + danger-zone + record-pager + inline-edit 改名）；`services.new`/`services.$id.edit`（form-page 分区表单：dirty guard + 草稿恢复 + 409 演示）；部署表单（form-sheet，字段类型覆盖 widget 全家）；`services.$id/deployments` 行内编辑；创建 service 用 form-dialog；`api-keys` 页（secret-reveal 流）。

**验收清单**

- [ ] 三宿主同一份表单定义可跑；字段校验（zod）错误即时显示
- [ ] 服务端字段错误回填到对应字段；409 提示冲突
- [ ] dirty guard：行内导航与刷新均拦截确认；草稿自动保存 + 恢复提示 + 丢弃
- [ ] reference-select：搜索触发加载、分页选项、就地新建回选（service 选 project）
- [ ] 详情 hero/tabs 深链（tab 进 URL）；子资源列表作用域正确
- [ ] 长任务：触发后行内进行态 → 轮询终态 → 刷新列表
- [ ] secret 创建后一次性展示 + 复制，再次查看不可得
- [ ] type-to-confirm 删除（api-key）；inline-edit-field 保存生效
- [ ] diff-viewer 渲染 JSON/文本两版差异
- [ ] git 提交：`feat(m3): form hosts & widgets, detail views, references, tasks`

---

## M4 —— 资源层与高级表格

**任务（core）**

1. `resource/`：defineResource + resourceListRouteOptions/resourceDetailRouteOptions + inferColumns/inferFormFields + Guesser（dev-only 打印）+ navFromResources。
2. `inline/`：useInlineEdit（若 M3 未提前完成）。

**任务（registry blocks）**

3. `data-table` 高级模式：分组行、树形展开、聚合行（sum/avg/count）、行内编辑 changeSet（脏单元格标记 + 批量提交 + 取消）、虚拟化（>200 行自动）、移动端卡片化（<sm）。
4. `notification-inbox`、`global-search-page`。
5. SaaS 模板页：`team-page`、`audit-log`、`settings-page`（完整三节 + 时区/主题）、`onboarding`。
6. `list-page` grid 变体（磁贴墙）。

**任务（demo + mock）**

7. mock：members/invitations（角色/状态）、notifications（已读未读）、搜索聚合端点、树形数据（region→zone 分组）、audit 完整化。
8. 页面：用 defineResource 重写一个资源（对照 M2 手写页，证明等价 + 代码量对比写进 README）；`t.$tenantId/team`、`notifications`、`search`（⌘K 回车进入）、`onboarding`（首登向导演示）、树形/分组/聚合演示页。

**验收清单**

- [ ] defineResource 版页面与手写版功能等价；导航/面包屑/权限从资源注册表派生
- [ ] Guesser dev 模式打印可用的 columns/form 配置
- [ ] 分组/树形/聚合正确渲染；行内编辑 changeSet 批量提交 + 撤销
- [ ] 虚拟化：1000 行种子滚动流畅
- [ ] 移动视口表格卡片化
- [ ] team-page 完整流：邀请 → 待处理 → 接受 → 改角色 → 移除（confirm）
- [ ] 通知收件箱已读未读 + badge；全局搜索跨资源出结果
- [ ] git 提交：`feat(m4): resource definition layer, advanced table, saas template pages`

---

## M5 —— 收尾

**任务**

1. core 单测补全：useResourceTable 四模式行为、createResource 失效与 mutationMode、useReference 聚合、tenant/auth 守卫、datetime（含 DST 边界）、useInlineEdit、savedViews。
2. demo 守卫测试（反模式扫描）：裸 fetch、手拼资源 queryKey、window.confirm、绕过 TenantProvider 直写租户 localStorage、blocks 硬编码色值。
3. Playwright 冒烟：登录→切租户→列表过滤分页→详情→表单提交→undoable 删除。
4. GitHub Actions：lint/test/build/registry validate（push + PR）。
5. changesets 初始化；core 发 `0.1.0`。
6. README 完善：安装（含私有 registry 认证）、五分钟上手（L2→L4 分层示例）、block 目录、升级策略、demo 截图。

**验收清单**

- [ ] 单测覆盖上列模块且全绿；守卫测试能抓到注入的反例
- [ ] CI 全绿；Playwright 冒烟通过
- [ ] `pnpm changeset` 可用；registry.json 与 core 版本对齐
- [ ] README 按新项目视角可照做走通
- [ ] git 提交：`feat(m5): tests, guard rails, ci, docs` + tag `v0.1.0`
