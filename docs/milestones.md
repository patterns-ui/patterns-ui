# 里程碑任务分解与验收清单

执行方式：每阶段派子代理实现 → 按本文验收清单审核 → 通过后 `git commit + push` → 进入下一阶段。通用验收项（每阶段都查）：`pnpm lint`、`pnpm test`、`pnpm build` 全绿；无越界 import（architecture.md §2 依赖规则）；无硬编码色值。

---

## M0 —— 骨架

**任务**

1. pnpm monorepo：`pnpm-workspace.yaml`（`packages/*`、`apps/*`）+ catalog 管理共享依赖版本；根 `package.json` 脚本（dev/build/test/lint/registry:build/typecheck）。
2. `tsconfig.base.json`（strict、`@types/react` 等）；每包继承。biome 初始化并配置（含 import 排序、禁止 `any` 豁免清单留空）。
3. `packages/core` 空壳：package.json（name `@patterns-ui/core`、peerDeps、exports 子路径骨架）、tsup 配置、`src/index.ts` 占位、vitest 就位。
4. `apps/demo`：Vite + React 19 + TanStack Router 文件路由（@tanstack/router-plugin，autoCodeSplitting）+ Tailwind v4 + TanStack Query；`shadcn init`（Base UI 方言）装基础件；`src/routes/index.tsx` 欢迎页。
5. **alias 消费链**：demo tsconfig paths + vite alias 加 `@/components/blocks/* → ../../registry/blocks/*`；在 `registry/blocks/shared/` 放一个样例 block（`status-badge`），demo 页面引用它渲染成功。
6. `registry/scripts/build.ts` 最小版：扫 meta.json → 内联源码 → 生成 `registry.json` + `dist/r/*.json`；`pnpm registry:build` + `shadcn registry validate` 通过。
7. `.gitignore`（node_modules/dist 等）、GitHub 无需 CI（M5 再加）。

**验收清单**

- [ ] `pnpm install && pnpm lint && pnpm build` 全绿
- [ ] `pnpm dev` 起 demo，页面渲染 status-badge 样例 block（含 tailwind 样式生效）
- [ ] `pnpm registry:build` 产物存在且 `shadcn registry validate` 通过
- [ ] core 包 `pnpm --filter @patterns-ui/core build` 产出 ESM + dts
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
5. SaaS 模板页：`team-page`、`audit-log`、`settings-page`（完整四节：组织/个人/安全/外观 + 时区/主题）、`onboarding`。
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

---

## M6 —— 地基与结构修复（四象限归位）

任务明细与判据见 docs/paradigm.md §5（A 发布就绪 → B 结构归位 → C L4 健壮化 → D 变体收敛 → E 文案与文档收尾）。M6 各项已完成（A–D 已合并，E 于 2026-10-23 收尾），验收清单按事实勾选：

**任务**

1. **A 发布就绪**：core 补 `@tanstack/react-table` peer；MIT + repository/engines/publishConfig 元数据；release workflow 仅 tag + CHANGELOG（changesets，不 npm publish）；theme `@theme inline` 映射段；registry:base 钉 Base UI；`IMPLICIT_NPM_IMPORTS` 收敛；build.ts 全 URL 自引用；CI registry.json 新鲜度 diff + publint/attw job。
2. **B 结构归位**：`scheduleUndoable` 下沉 data 内部；queryKey 工厂（listKey/detailKey/manyKey/*KeyPrefix）公共出口 + 契约测试；`createStorage(key, schema, {version, migrate})` 统一存储（替换 core/blocks 手写读写）；`useDebouncedCallback`/`isIsoDate`/label 工具单点化；Provider 组件级测试；`?page=-1`/`?size=-30` 钳制单测。
3. **C L4 健壮化**：def `list.pageSize` 单源直灌（缺省 30 fixture 演示）；`getId` 编译期约束（RequireGetId）；zod 内省 dev-only。
4. **D 变体收敛**：shell/sidebar 变体 → 基座 + `variant` prop（6 item 名并 2）；`AuthCardLayout` 抽取；ErrorPage 参数化单模板；`PageHeader` 共享原语（22px ×14 收敛）；过滤树字段级 API 下沉 core/filters；queryKey 公共出口接线；过滤树 e2e；typed-form-field label id + aria-describedby。
5. **E 文案与文档**：mutation 兼容壳删除（data 唯一出口）；文案对象化（form messages + use-resource-mutations messages，预留 messageCatalog 形态注释）；mock 修正（mulberry32 确定性 PRNG + owner ID 口径统一 SEED_USERS 目录 + mock 去 core 依赖）；api.ts 2xx JSON 兜底；CI（e2e 去 workflow_dispatch 门、fresh-clone-dev job、review 冒烟）；docs 漂移回写（core-api/architecture/blocks/milestones/README）；ISO 正则重叠决策记录（有意保留两套）。

**验收清单**

- [x] `publint`/`attw` CI job 绿（A）
- [x] CI `registry-consumer` job：tmp vite 工程 shadcn add → build → token 断言（A）
- [x] `grep -rn "from \"\.\./mutation\"" packages/core/src/data` 为空（B；M6-E 进一步删除 ./mutation 兼容壳，undoable 全部经 ./data 出口）；全仓无手拼 queryKey 数组、无裸 localStorage 读写（B）；createStorage key 变更后 guards G6 测试同步绿（B）
- [x] Provider 测试文件存在且覆盖三项关键副作用（B）；`?page=-1`/`?size=-30` 单测存在（B）
- [x] e2e：`goto('/t/<tid>/services?size=30')` 每页 30 行（C）
- [x] shell/sidebar 变体收敛（D）：`app-shell-*` / `side-nav-*` 通配各匹配 0（D 实现命名为无后缀基座 `app-shell` / `side-nav` + `variant` prop，较范式原判据「=1」更进一步）；preview 页可切三种 variant（D）；`text-[22px]` 全仓 grep 为 0（D）；过滤树 URL 还原 e2e 绿（D）
- [x] ci.yml 无 `workflow_dispatch` 门（e2e 随 PR/push；顶层触发器保留手动重跑）（E）；`pnpm install && pnpm dev` fresh-clone CI job 绿（E；本地 file:// clone 实测 dev :5173 与 review :4173 均 200）
- [x] （E 追加验收）`grep -rn "core/mutation" registry/ packages/` 为空；docs/core-api.md §6/§15/§16、architecture.md §2/§4、blocks.md、README.md 与现状一致

## M7 —— 范式落地（进行中；任务明细与判据见 docs/paradigm.md §6）

A1–A3（词表生成器/运行时层/页面迁移）与 B1–B3（eslint-plugin 四规则/三态截图基线/一致性分数棘轮）已落地（root scripts 与 CI 已接线）；各小节回写待 M7 收口统一补。先落 B4：

### M7-B4 核对器与编排（2026-10-23 落地）

**交付物**

1. **`pnpm ui:check` 一条龙**（scripts/ui-check.mjs，node 零依赖编排器）：10 步按序——typecheck → biome lint → 范式 lint（lint:eslint）→ archetype/slot（slots:check）→ 产物新鲜度（`pnpm build` 后 `git diff --exit-code`，与 CI 同口径）→ 三方一致核对（check:names）→ 截图基线（ui:shots --check）→ 分数棘轮（ui:score --check）→ a11y（ui:a11y）→ chunk 预算（demo build + chunk-budget 报告）。任一步失败**继续跑完**再汇总非零退出；每步打印标题+耗时。旋钮：`--skip <id|name>[,...]`（按编号/名称豁免）、`--fast`（= 跳 7/9/10 浏览器与构建项的静态快跑）、`--list`。
2. **三方一致核对** `pnpm check:names`（scripts/check-config-names.mts，tsx 以 demo tsconfig 加载 pages 为真实模块后受检遍历——结构性提取而非正则）：配置名字 ⊆ 注入表 ∪ sandbox 登记表。核对项：tables.ts 注入子表键集与 core `PAGE_BLOCKS_BY_ARCHETYPE` 逐原型集合相等；definePage 的 host/slots/steps[].block/sections[].content.block 按原型域核对；def 列 `meta.cell` ⊆ cellFor 标记集且映射进 CELL_NAMES；tabs 登记名（block/sandbox）⊆ BLOCK_NAMES ∪ sandbox 登记表（detail spec customTabs/dialogs 键 + 文件头 `// sandbox:` 登记，登记须有对应实现）；另有兜底网——config 内任何命中 BLOCK_NAMES 的串必须出于已核对位置。失败输出列全表（报错即目录）。**覆盖 typecheck 盲区**：`meta.cell`/`tabs[].sandbox` 是 `string`（无字面量收窄）、注入表与词表的集合相等也只有运行时可核。
3. **a11y 检查** `pnpm ui:a11y`（@axe-core/playwright 4.14.0，demo devDep 进 catalog）：`e2e/a11y.spec.ts` + 独立 `playwright.config.a11y.ts`（testMatch 隔离；主 config testIgnore 排除，不进 dev 冒烟套件；归 ui:check 第 9 步编排）。口径：tags wcag2a+wcag2aa；**serious/critical = 失败，moderate/minor 报告留账不判败**（spec 头与本文档同步）。页集 = 截图基线同款三页（services 列表已登录 / settings / auth sign-in）。
4. **chunk 体积预算报告**（scripts/chunk-budget.mjs，读 `apps/demo/dist/assets/*.js` 文件大小，不引 visualizer）：逐 chunk 预算表（基名 = 文件名去尾部 8 位 hash）+ 表外默认 32 KiB + 总量预算；初始值 = 2026-10-23 实测 × 1.15 取整（表内 15 项 + 总量 1449 KiB，实测合计 1259.3 KiB）。**超限报警不失败**（paradigm §8「超限报警」）；`--table` 按当前实测重算预算初值。

**随带修复（a11y 首扫发现，均为 a11y 属性类小改）**

- **typed-form-field label 绑定断裂**（B2 报告的「SecretWidget label 未关联」即此症，非独立遗留）：widgets 在 FieldShell **外层**调 `useFieldControlIds()` 读到 null，全部 14 个 widget 的控件 id/aria-describedby 落空、label htmlFor 悬空。修法：FieldShell children 增 render-prop 形态（`(ids) => ReactNode`，ReactNode 形态兼容保留），widgets 全量改用——id 绑定回归（settings 个人/安全节、service 表单、onboarding 等全部 typed-form 页受益）。
- **9 处无名 select trigger 补 aria-label**（Base UI Select trigger 是 `role=combobox`，ARIA 1.2 该 role **name from author**——触发器内的可见文本不计入可访问名，axe `button-name` 全数误名）：filter-bar×4、pagination-bar、refresh-bar、settings-page×2、onboarding（team-page/onboarding 角色选择已有 aria-label，未动）。

**验收记录（2026-10-23）**

- `pnpm ui:check` 10 步全绿（总耗时 95.9s；freshness 步本地以 `git add -A` 暂存口径过——registry blocks 源码变更须与再生成的 registry.json 同 commit，禁 commit 环境下以暂存验证，提交后 CI 自然绿）。
- 三方核对失败路径：team.page.ts 塞 `toolbar: "fake-block"` → 第 6 步红并列 resource-list 注入域全表；services def 塞 `sandbox: "fake-block"` → 红并列 sandbox 登记表全表；还原复绿。
- `pnpm ui:a11y` 单独 3/3 绿（修复后 wcag2a/2aa 零违规，moderate 以下亦无留账项）。
- `pnpm -r typecheck` / `pnpm lint` / `pnpm -r test`（core 241 + eslint-plugin 35 + demo 13）/ e2e dev 7 + preview 2 全绿；lockfile 变更经 `pnpm exec biome format --write pnpm-lock.yaml` 恢复仓内风格。
