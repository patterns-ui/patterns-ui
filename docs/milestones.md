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

A1–D 全部 10 个任务已落地（root scripts 与 CI 已接线），小节按落地序回写如下。M7-D（2026-10-23）为收官件；§6 验收清单勾选判定见 paradigm.md（主会话收口）。

### M7-A1 词表生成器与类型层（2026-10-23 落地）

- `pnpm vocab:generate`（registry/scripts/generate-blocks.ts）：读全部 block meta + themes 产 `packages/core/src/vocab/blocks.generated.ts`（**提交进 git**）——ARCHETYPES/Archetype（7 原型）、CELL_NAMES/CellName（排除映射器 cell-for）、BLOCK_NAMES/BlockName、BLOCKS_BY_ARCHETYPE + BlockNameFor<A>（原型收窄）、THEME_PRESET_NAMES 及 CELL_DOCS/BLOCK_DOCS（= meta description）。形态定案：`as const` 元组 + `(typeof X)[number]` 派生联合——报错信息展开全部合法值（报错即目录；别名直写只显示最近候选 TS2820 不满足验收）；确定性 = 码位排序 + biome canonicalize，连跑零 diff。registry meta 增可选 `archetype`（7 合法值，构建校验失败即红 + 透传 item 顶层；13 个原型宿主/预设赋值，overview 待 M8 dashboard-page）；core 出口增 `./vocab` 子路径；根 build 先 vocab 再 core；CI freshness 步纳词表生成物。
- 验收：写 `cell-statuz` 报错列出全部 9 个合法 cell 名（TS2820 展开全表）；core 单测 blocks.test.ts（单源 fs 实扫、DOCS 一致、@ts-expect-error 编译期封闭、生成器新鲜度）随 187+13 全绿；vocab:generate 与 registry:build 幂等。

### M7-A2 范式运行时层（2026-10-23 落地）

- core/page 新子路径：按原型分组注入子表（BlockTable<A> 完整覆盖 Record，漏注入即编译错）+ PageBlockNameFor<A> + `definePage<Archetype>`（七原型 slot 结构收窄，禁 JSX/无类型闭包）+ resolveBlock/planPage/PageRenderer（名字缺失报错列注入域全表、slot 越界列该原型合法 slot 清单）。`defineFlow` headless 状态机（步骤机/转移/步骤间数据保留）+ **action 词表初版 10 个**（navigate/toast/refresh/invalidate/refetch/close/reload/copy/waitDialog/loading，封闭只追加，编译期+运行期双拒绝）。detail `kind:"custom"` 登记制（未登记 throw 列登记域）；settings-page 节化 sections[]（preset|node，内置四节转预置构件，输出与旧版逐卡一致）；分页协议升格 def 一等契约节点（page/offset/keyset 封闭词表；offset 类型层合法、引擎显式未实现 throw + 失败路径单测；legacy mode 双轨兼容冲突 throw；paginationCapabilitiesOf 能力派生）；parseError 单源（problem+json / {code,message} / 裸状态码 / 字段错误数组，422 必回填 fieldErrors）替换 form/team-page/error-state 三处自解析。docs：core-api.md §3 拆 §3.1 契约节点 + §3.2 引擎层、新 §17。
- 验收：237+13 单测全绿（失败路径全含「报错即目录」断言）；typecheck/lint 绿；e2e dev 7 + preview 2 绿；词表封闭演示 action 全 10 名 / resource-list 全 11 名展开；registry/vocab 产物幂等。

### M7-A3 demo 页面迁移（2026-10-23 落地）

- 18 页三批配置化（v4 修订实数：25 路由 = 18 配置化 + 7 豁免）：批 1 资源 8 页（services×4 / audit / api-keys / regions / deployments）走 defineResourceListPage / defineResourceDetailPage 工厂（headerActions/toolbar/rowActions 声明化 + 类型化 ctx、table 受控/聚合、mutations 档位、dialogs 登记表、inlineSave；services 全交互等价重建——分组/批量/导出/快捷键/undoable）；批 2 模式 6 页（settings/team/notifications/search/onboarding/index）definePage 配置化（PAGE_SLOT_FILLS 扩 team-page/notification-inbox/global-search-page，auth-flow 增 footer 槽）；批 3 auth 4 页 definePage("auth-flow")。豁免 7 文件头注释（403 / __root / _shell×2 / t.$tenantId / preview / dev.audit-legacy）。净 -891 行。
- 验收：`grep -rEl '<[A-Z][a-zA-Z]*' apps/demo/src/pages` 为空；`ls apps/demo/src/pages/*.page.ts | wc -l` = 18；e2e 行为等价（dev 7 + preview 2 绿）；vocab 零 diff。遗留（M8 范围非 A3 债务）：api-keys/regions/deployments 渲染出口仍为 demo 视图组件、overview 摘要区待 dashboard-page、defineFlow 首次真实页面消费在 M8。

### M7-B1 范式 lint 插件（2026-10-23 落地）

- packages/eslint-plugin（flat config preset，**规则零仓内路径**——M7-D 发布预置）：no-jsx-in-pages（pages 域禁 JSX，豁免 = 文件头 `// sandbox:` 登记）、no-raw-primitives（裸 table 全家 + dialog，报错逐原语给替代 block）、no-hex-arbitrary-tailwind（hex 与 arbitrary 值；--fix 仅 4px 栅格确定性等价 `p-[8px]`→`p-2`）、registry-frozen（registry/.freeze.json 快照：路径/name/targetDir 三不变内容可变；结构归属判定，半改名漏报已修）。check-archetype-slots 三方一致校验（meta.archetype ↔ BLOCKS_BY_ARCHETYPE ↔ PAGE_SLOT_FILLS + 词表新鲜度，失败列全表）。eslint.config.mjs 仅辖 pages+registry 域，biome 全仓其余职责不变；文档 registry.md §7。
- 验收：RuleTester 35 用例；故意写 `<table>` 与 `#ff0000` lint 拦截且 `--fix` 可用；`pnpm lint:eslint` / `pnpm slots:check` 进 CI 绿。**发布状态（定案 4）**：`private: true` 仅本仓 CI 使用，npm 发布推迟至有真实外部消费者反馈。

### M7-B2 三态截图基线与 chaos（2026-10-23 落地）

- chaos 统一：`?demo-error=` 派发器进 mock 入口（500 全局 / `<resource>:<code>` 定向 / 会话端点豁免防打死），9/9 路由组生效；旧 services/audit header gate 迁移删除（兼容超集）。三态基线 13 张（services 列表/详情 + settings + auth sign-in 的 loading/empty/error）入库 `apps/demo/e2e/screenshots/baseline/`，`toHaveScreenshot(maxDiffPixelRatio: 0.02)`，独立 playwright.config.shots.ts。确定性三件套：page.clock.setFixedTime(EPOCH) 冻结时钟 + `/api/__e2e/reset` 每测重置（本仓首个 mock 重置机制）+ reducedMotion 禁动画；workers=1、locale/timezone/viewport 钉死；.gitignore `screenshots/` 锚定根目录。
- 验收：`pnpm ui:shots --check` 13 张 CI 绿（diff 图随 artifact 上传）；dev e2e 7 + preview 2 保持绿。

### M7-B3 一致性分数棘轮（2026-10-23 落地）

- scripts/consistency-score.mjs（零依赖）七项可枚举计数（§2.3 债务清单机械化子集，**非平均值**，新增页面不稀释）：手拼 queryKey / 裸 localStorage / 手写计时器 / pages JSX / 豁免外手工 block import / sandbox 数 = 反向只许降；词表覆盖页面比例 = 正向只许升。scores.json 基线入库（v1 口径，确定性生成）；`--check` 恶化 exit 1、改善提示重生成不自动写。基线：queryKey×5（demo ad-hoc）、localStorage×5（token 凭证语义 + theme 防闪，从严计入保持可见）、计时器×2、词表覆盖 13/18。
- 验收：`pnpm ui:score --check` CI 绿；首份 scores.json 基线入库。

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

### M7-C1 文档生成器（2026-10-23 落地）

**交付物**

1. **`pnpm docs:generate`**（registry/scripts/generate-docs.ts，tsx；确定性输出，连跑零 diff，生成物提交进 git）产出三件：
   - **AGENTS.md**（仓根路由层，10 行 ≤12 上限，生成器内置行数断言）：ui-page skill 加载指引（.zcode/.claude/.agents 三目录按宿主取一）+ 3 铁律（页面=配置不写 JSX 词表内名字 / 真缺走 sandbox 棘轮 ui-block / 品牌定制只动 theme token ui-theme）+ patterns.md 事实层指针。终步过 biome format（markdown 在 biome 检查域，与 generate-blocks.ts 对生成 TS 同手法）。
   - **CLAUDE.md → AGENTS.md 相对 symlink**（每次 regen 重建；git 存 mode 120000）。仓内原无 CLAUDE.md 文件，无冲突；生成器对「同名普通文件」走销毁替换路径（paradigm §4.1 注）。
   - **docs/patterns.md**（事实层五节）：①原型判定表（七原型 × slot × 宿主 × **词表内宿主/预设列**——BLOCKS_BY_ARCHETYPE 单源注入）；②判别式（auth-flow vs wizard + error/empty 横切三态）；③词表目录（3.1 blocks 73 / 3.2 cells 9 / 3.3 主题 preset 2 / 3.4 action 10 / 3.5 分页协议 3 含 offset 未实现标注；节尾留 M7-C2 pattern 目录扩展位）；④每原型 2-3 精选组合（共 18，全部取材 demo 18 页真实组合）；⑤反模式 8 条（与 eslint 四规则、§3.5 对齐）。
2. **编辑性内容单源 registry/scripts/docs-data.ts**：AGENTS 文案/判定表/判别式/组合/反模式/分页协议说明；词表节数据**零手写副本**——生成器直接 import core 源（blocks.generated.ts、page/actions 的 ACTION_NAMES/ACTION_DOCS、list 的 PAGINATION_MODES）+ 读 registry/themes/*.json（preset 描述）。生成器对编辑数据做词表交叉校验：组合 blocks ⊆ BLOCK_NAMES、判定表原型序 = ARCHETYPES、分页协议描述闭集覆盖、每原型组合 2-3 个、AGENTS.md ≤12 行——编辑数据漂出词表即失败。
3. **新鲜度两处接线（同口径互参）**：ci.yml Freshness 步（`pnpm vocab:generate && pnpm docs:generate` 后 diff 路径追加 AGENTS.md / docs/patterns.md / CLAUDE.md）与 ui-check.mjs 第 5 步（pnpm build 后增跑 docs:generate 再同口径 diff）。根 build 不前置 docs:generate（文档不进构建链）；vocab:generate 收尾输出与 docs:generate 输出互加连跑提示（选简单方案：提示而非检测）。生成器收尾另有 git check-ignore 防线（生成物被 .gitignore 排除即失败）。

**验收记录（2026-10-23）**

- 连跑三次 sha256 逐字节一致（AGENTS.md 80d51afb… / patterns.md 9a6c2c95…；CLAUDE.md sha = AGENTS.md 内容，证 symlink 指向）。
- 单源回环：篡改 cell-id meta description → `pnpm vocab:generate && pnpm docs:generate` → blocks.generated.ts 与 patterns.md 两表同步变 → git checkout 还原 + regen 后哈希复原。
- 词表节一致性抽查（tsx 探针）：BLOCK 73 / CELL 9 / ACTION 10 / THEME 2 / PAGINATION 3 名字与描述前缀全部在场；反向核对 patterns.md 表内 103 行名字零词表外项。
- symlink diff 命中验证：staged 后将 CLAUDE.md 换普通文件 → `git diff --exit-code -- … CLAUDE.md` 退出 1（捕获 type type）；恢复 symlink 后退出 0。
- `pnpm ui:check --fast` 六步静态全绿（freshness 步含文档路径）；`pnpm -r typecheck` / `pnpm lint`（biome 379 files，含两新脚本与 CLAUDE.md symlink 共存）/ `pnpm -r test`（241+35+13）全绿。
- 本地 freshness 以 `git add -A` 暂存口径验证（同 B4 惯例；生成物为新文件，未暂存则 git diff 不见）。

### M7-C2 模式一级概念（2026-10-23 落地）

**交付物**

1. **registry `pattern` 附加字段 + 5 模式契约卡**：meta 增可选 `pattern: { contractCard, blocks[], metaPatterns[] }`（组装入口声明）；5 模式各一页契约卡落 `registry/patterns/<name>.contract.md`（audit-log / team / notification / settings / onboarding；模式名 = 卡文件名，与 block 名解耦——team-page block → team 模式）。**contractVersion 单源在卡**（`- **contractVersion**: <int>` 行，build.ts 与 docs 生成器同款解析）；两层契约 = 元模式契约（按协议轴章节结构：端点形状/分页协议/错误语义）+ 业务契约（领域字段 + 内置决策及理由——如 audit 为何 keyset）；含变更日志节。build.ts 校验：blocks ⊆ 全部 block 名且含组装入口自身、metaPatterns ∈ 元模式封闭词表（16 值，与 core/meta `META_PATTERN_NAMES` 同源硬编码两处）、contractCard 存在且含版本行；契约卡以 file 形态并入 item files（`type: registry:file`，target = block targetDir 旁），pattern + contractVersion 透传 item 顶层。**CLI 剥离坑写进 registry.md §2**：顶层 pattern 经 shadcn CLI zod parse 静默剥离——validate 通过 ≠ 透传，仓内工具（docs 生成器等）一律读源 meta.json，契约卡经 files 通道分发不受影响。
2. **audit-trail 元模式引擎**（`packages/core/src/audit`，子路径 `@patterns-ui/core/audit`）：headless（不渲染不 import 组件），组合 list-browse 引擎（useResourceTable server-cursor/load-more 两档）并**钉死 keyset 协议**（无 page/offset 选项——协议选择是模式业务决策，单源在契约卡）；叠加审计领域语义：`AuditTrailEvent`（actor·action 字段形状）、`auditTrailFilterDefs`（action facet 多选 / resource / actor / createdAt 时间范围窗口；文案标签注入、缺省回落字段名——引擎不带文案）、facets 恒 `["action"]`、搜索面缺省 action/resource/actor；出口 `useAuditTrail`（list 产物 + defs + mode + capabilities + hasNextPage）。audit-log block 改消费引擎：公开 props 不变（`mode?: "server-cursor" | "load-more"` 双向映射 shape），UI 预设（列定义/文案/ListPage 组装）留 block。
3. **read-state 元模式引擎**（`packages/core/src/read`，子路径 `@patterns-ui/core/read`）：未读计数共享缓存（queryKey = `listKey(name, pageSize)`，同 name 取数点共享——badge 与收件箱；queryFn 规范化 `{ pageSize, sort }` 同请求形状）、单条已读（`update(id,{read:true})`；无能力 → mutation.error 契约错误不外抛）、全部已读（`markAllRead(ids)` 端点优先 → 逐条 update 扇出回落 → 无写能力静默返回）、读态翻转 `mutationMode: pessimistic（缺省）/ optimistic`（乐观档 onMutate 即翻缓存、onError 回滚、onSettled 失效对账）。出口 `useReadState` + `useUnreadCount`。notification-inbox block 改消费引擎（**pessimistic 缺省 = 抽取前行为**；缓存命名空间沿用 `"notification-inbox"`，bell/收件箱共享缓存延续；`useUnreadCount` 保留单参签名作模式定名包装——demo bell 零改动）。
4. **core/meta 公共机制**（`packages/core/src/meta`，子路径 `@patterns-ui/core/meta`）：`META_PATTERN_NAMES` 封闭词表（16 值 = paradigm §1.2 表序）+ `defineMetaPattern(name, contractVersion, adapterShape)`（名字越表/版本非正整数 → throw 列全表）+ `validateMetaPatternAdapter`（dev-only：zod safeParse 形状校验 + contractVersion 失配警告，均 console.warn 不阻断；`NODE_ENV=production` 立即返回零开销；env/warn 可注入供单测）。两引擎在 hook 挂载时校验注入适配器（AUDIT_TRAIL v1 = Resource 形状；READ_STATE v1 = client 形状）。
5. **patterns.md §3.6 业务模式目录**（docs 生成器数据源扩展）：读**源 meta.pattern**（不读 dist——剥离坑）+ 契约卡解析（首行 blockquote 摘要 + 「内置决策」节加粗要点 + contractVersion），发射目录表（模式 × 组装入口 × blocks × 元模式 × 契约版本）+ 逐模式摘要；交叉校验 blocks ⊆ BLOCK_NAMES、metaPatterns ⊆ META_PATTERN_NAMES、卡缺版本行/摘要/决策即失败；§2 判别式增三层决策树第一条（第一层指向 §3.6——决策树第二层引用落形）。docs-data.ts 仅增一条框架文案（编辑性内容最小化）。
6. **registry.md 同步 + dry-run 冒烟 CI**：registry.md §2 补 pattern 字段语义/校验/剥离坑/契约卡 files 通道与 type 取值清单（本仓 item 三值 + schema 全枚举含 `registry:item`/`registry:file` 语义说明）、§3 构建校验步骤与 §8 文档生成器节。`scripts/registry-consumer-smoke.mjs` 增 **pattern item dry-run 冒烟**（M7-C2）：`shadcn add audit-log --dry-run` 经独立 overlay server（dist 全集复制 + 自引用 `patterns-ui/patterns-ui/*` 改写为本 server URL——CI 无私有仓库 token，改写只换解析源不换依赖图）解析整棵依赖树，断言退出 0 且计划提及组装入口；`SMOKE_SKIP_ADD=1` 跳过（dry-run 属 CLI 网络路径，无离线等价物）；ci.yml registry-consumer job 注释与步骤名同步（job 内跑 `pnpm registry:smoke` 即含 dry-run）。

**验收记录（2026-10-23）**

- 三生成器链 `pnpm registry:build && pnpm vocab:generate && pnpm docs:generate` 连跑两次零增量（sha256 一致：patterns.md / registry.json / blocks.generated.ts）；`registry validate` 本机不跑（CI 权威）。
- **单源回环**：篡改 audit-log meta.pattern.blocks（移除 data-table）→ vocab+docs regen → patterns.md/registry.json 跟变（sha256 变化）→ 还原 + regen → 三产物哈希与篡改前逐字节一致。
- **build 校验失败路径**：metaPatterns 越封闭词表 / blocks 引用未知 block / contractCard 不存在——三者均构建失败退出 1 且报错列合法值全表；还原后复绿。
- **行为等价证据**：audit-log block 公开 props/缺省值/PaginationBar 映射逐项不变（mode→shape 双射；hasNextPage 语义同构 `nextCursor !== undefined || load-more`；staleTime 10s、pageSize [10,20,50]/20、搜索面、facets 原样进引擎）；notification-inbox queryKey（`["notification-inbox","list",30]`）、pessimistic 翻转、全部已读回落语义不变（mock list 忽略 sort 参数，queryFn 规范化后响应逐字节同）；bell 单参 `useUnreadCount(client)` 签名保留（demo `notification-bell.tsx` 零改动）。e2e 双套（dev 11 含 C3 在途 3 spec 全绿 / preview 2）+ shots --check 13 张 + `pnpm ui:check --fast` 六步全绿——两 block 均在渲染树内（bell 挂 top-bar 全程在树）。
- **单测**：core 267（+26：meta 8——形状不符/版本失配/生产零开销/null 容错；audit 9——keyset 钉死与能力派生/append-only 栈后退零请求/断页 hasNextPage=false/游标失效容错/load-more 累计/过滤清栈/defs 形状与文案注入/请求面/残缺 Resource 挂载警告；read 9——共享缓存单请求/pessimistic 递减/乐观翻转成功/乐观失败回滚/全部已读端点优先与扇出回落/无写能力静默/无 update 契约错误/useUnreadCount）。
- `pnpm -r typecheck` / `pnpm lint`（biome，含 registry/patterns/*.md）/ `pnpm lint:eslint` / `pnpm slots:check` / `pnpm ui:score --check` / `pnpm -r test`（core 267 + eslint-plugin 35 + demo 13）全绿。
- **publint / attw**：core 三新子路径（./meta ./audit ./read）exports 三形态（import/require × types/default）+ tsup modules 后 `pnpm --filter @patterns-ui/core build && publint` All good；attw node16 profile 全子路径 CJS/ESM 双绿（node10 列结构性无解，CI 同口径忽略）。
- dry-run 冒烟本机不跑真实 CLI（网络受限，CI 权威）；overlay 改写逻辑经 `node --check` 与 CI 接线评审。

### M7-C3 skills 与验收附件（2026-10-23 落地）

- **三 skill × 三 agent 目录**：`.zcode/skills/` 为单一源（ui-page 五步[分类→抄 patterns.md §4 组合→写配置四禁→typecheck+ui:check --fast 自检→三态截图交付]/ui-block 三处查重+sandbox 水印+PROPOSED 清单+freeze 豁免/ui-theme preset 词表指引+只动 themes css token），`.claude/skills/`、`.agents/skills/` 为 `cp -R` 副本——三目录逐字节一致（`diff -r` 零输出）；SKILL.md 正文零词表名泄漏（72 个词表名 grep CLEAN，词表以 patterns.md 与 typecheck 报错为单源）。`.gitignore` `.zcode/`→`.zcode/*`+`!.zcode/skills/` 放行单源入库。CI Freshness 步增 skills 三目录 `diff -r` 同步校验。
- **docs/agent-acceptance.md**：梯度任务模板 L1 只读列表 / L2 全 CRUD（422+409+bulk 链路要求）/ L3 模式与品牌三选一；判定清单自动层四项（eslint 全规则 / check:names 三方核对 / sandbox 零新增 / 三态截图）+ 人工层只判配置可读性（paradigm §6-C3 两层口径逐条对齐）。
- **e2e 三 spec**：form-422-loopback（services new「名称含 taken」服务端独有 422 字段回填→改正成功 + team 邀请重复邮箱 422→换邮箱成功，mock 零改动两机制正交）；conflict-409（真两上下文：页面缓存 V→API If-Match 直改 V+1→本页提交 409→统一冲突文案→reload 取他版→再提交 V+2 核实）；bulk-partial-failure（API 预置确定性数据→勾两行两段式确认→undo 撤销恢复→再删放行→汇总「成功 1 失败 1」+失败腿保留 API 核实）。确定性沿用 B2 三件套（EPOCH/reducedMotion/每测 reset）。
- dev 全套 11 spec + preview 2 + shots 13 全绿（主会话集成验收 ui:check 十步全绿覆盖）。

### M7-D 分发型执行层（2026-10-23 落地，M7 收官件）

**交付物**

1. **消费端 typecheck 防线**（scripts/registry-consumer-smoke.mjs 扩展，paradigm §6 验收「消费端空白项目装 core 后写错 block 名 typecheck 报错」）：`pnpm --filter @patterns-ui/core pack` 产 tarball → tmp 消费项目 `pnpm add @patterns-ui/core@file:<tarball>`（模拟装包，不触 npm）→ 引用 BlockName/CellName/PageBlockNameFor 的配置文件四拍验证：写对 `tsc --noEmit` 绿 → 词表外名字 `cell-statuz` 红**且报错列出全部合法 cell 名**（期望全表从 blocks.generated.ts 提取单源比对，下限 ≥9）→ 还原复绿。旋钮 `SMOKE_SKIP_TYPES=1`；CI registry-consumer job 覆盖（构建注释同步 core dist 供 pack）。
2. **skills 通道一 registry item**（76th item）：新 item `skills`，type `registry:file`（schema 合法枚举；paradigm §4.3 落形），定义源 `registry/skills/skills.json`。files 携带三份 SKILL.md（**源 = .zcode/skills/ 单源**，build 链读取内联，仓内不复制第二份源）+ 内嵌渲染脚本（registry/skills/render-skills.mjs 单源）。target 全 `~/` 前缀 = **消费端项目根**（官方 registry 文档 "Use ~ to refer to the root of the project"，如 `~/.env`），staging 落 `.patterns-ui/skills/`；消费端 `node .patterns-ui/skills/render-skills.mjs` 渲染——`--host claude|zcode|agents|all` 选宿主落 `.claude/.zcode/.agents` skills 目录，`--pages-dir`（缺省 src/pages）与 `--pm`（lockfile 探测）按项目形态微调正文、剥离仓内同步尾注、注入渲染横幅（含消费端词表事实源提示）——「按消费项目生成变体」的最小自实现（零依赖 node mjs，幂等）。item 无 dependencies/registryDependencies（禁裸名约束 vacuous 满足）；build.ts 校验 def（type 枚举、~/ 前缀、SKILL.md 源存在、单源路径白名单）。
3. **skills 通道二 skills.sh 静态兼容**：调研 vercel-labs/skills CLI 文档——标准扫描目录**已含 `.claude/skills/` 与 `.agents/skills/`**（容器目录三层深扫描，`<skill>/SKILL.md` 即条目，frontmatter name/description 已合规）——仓内三目录单一源结构**原生兼容，零布局改动**；静态源不随项目形态调整（通道张力按 paradigm §4.3 由通道一补）。README 新「AI / skills（双通道）」节 + Block 目录表增 skills 行（76 items）；registry.md §1/§4 同步。
4. **eslint-plugin 发布状态确认（定案 4）**：`private: true` ✓、ci.yml/release.yml 无任何发布步 ✓（release 仅 changesets tag @patterns-ui/core）；registry.md §7.2 与 README 开发节一句话声明推迟发布。
5. **smoke 扩展**：skills item 真实 add（在线路径，本地 server 托管 dist/r/skills.json）+ staging 落盘断言 + 渲染脚本三宿主渲染断言（frontmatter/横幅/路径改写/尾注剥离）；离线路径（SMOKE_SKIP_ADD=1）由仓内单源拷贝至相同落点走同款断言。ci.yml registry-consumer job 步骤名与注释同步。

**验收记录（2026-10-23）**

- typecheck 防线本机全绿（离线 SMOKE_SKIP_ADD 模式四拍全过）：pack → file: 装（peers 自动装）→ 写对绿 → `cell-statuz` 红 TS2820 列全部 9 个 cell 名 → 还原绿；SMOKE_SKIP_TYPES=1 跳过生效。
- skills item 经 `pnpm registry:build` 产出（dist/r/skills.json 4 files、deps 空、targets `~/.patterns-ui/skills/**`）；渲染脚本 node 直跑演示：tmp 目录 3 宿主 × 3 skill 落盘，横幅/`apps/demo/src/pages`→`src/pages` 改写/`pnpm `→`npm run ` 改写/同步尾注剥离逐项断言过；`--host` 单选、`--dry-run`、未知宿主与缺源报错退出码 1 验证。
- 在线 `shadcn add` 本机受限：CLI 于 "Checking registry ✔" 已消费 skills.json 通过其 registry-item zod 解析，随后 ui.shadcn.com/r/colors/neutral.json 拉取被本机网络断连（各版本 CLI 一致，与 item 无关，脚本头注既有记录）；`registry validate` 同不跑——CI 权威。
- 三生成器链连跑零 diff；`pnpm ui:check --fast` / `pnpm -r typecheck` / `pnpm lint` / `pnpm -r test` 全绿；e2e 不涉（无 UI/block 改动）。

### M7 总收口（2026-10-23）

**paradigm §6 验收清单七条逐条判定（全绿）**：

1. **A1/A2**：`cell-statuz` TS2820 报错展开全部 9 个合法 cell 名（A1 验收亲测 + D 消费端防线单源断言复验）；A2 失败路径单测全绿（core 267：解析器名字缺失/slot 越界/action 词表外/offset 未实现/flow 转移缺失，报错全含合法值清单）。
2. **A3**：pages 0 JSX、18 页（时点）、7 豁免头注释（paradigm v4 验收命令亲测；后续新增页正常增长，见 §6 注）。
3. **B1**：`<table>`/`#ff0000` lint 拦截（主会话现场演示，报错逐原语给替代）+ `--fix` p-[8px]→p-2；slots:check 三方一致 CI 绿。
4. **B2/B3**：`pnpm ui:shots --check` 与 `pnpm ui:score --check` CI 绿（截图基线 CI 跨环境首跑即绿）；scores.json 基线入库（含收口重生成：vocabCoverage 13/18→14/19 改善入库）。
5. **C3 agent 验收两层**：自动层四项机械化（eslint 全规则/check:names/sandbox 零新增/三态截图）+ **L1 标准任务实跑通过**——不喂仓内上下文的新 agent 会话仅凭 L1 提示词原样下发，自行经 AGENTS.md → ui-page skill → patterns.md 路由，产出 certificates 只读列表页（87 行纯配置含元模式决策记录 page-vs-keyset 理由 + mock 42 行确定性种子 + e2e 一条主链路 + 三态截图基线），主会话亲跑 `pnpm ui:check` 十步全绿；人工层配置可读性审查通过（§3.4 一等公民：声明式、无闭包、决策留痕）。验收产物作为范式活样例入库（demo 永久保有 certificates 页）。
6. **C2/D**：pattern dry-run CI 绿（registry-consumer job 首跑即绿）；消费端空白项目装 core tarball 后写错 block 名 typecheck 报错列全表（冒烟四拍：写对绿→写错红全表→还原绿）。
7. **C1**：三生成器链（registry/vocab/docs）+ skills 三目录 diff -r regen 后 `git diff --exit-code` 干净。

**M7 全部 11 任务（先行项 + A1/A2/A3 + B1–B4 + C1/C2/C3 + D）收官**。commit 链：49aadd3 → 93f833d → a57f089 → 5505649 → 53b88cc → 9e4c161/75b3532/eabf7de → bb2eaba/504c718 → 0aadcdf → b91ddbd → eeeceae/1f0987d → 5ab650b →（本收口 commit）。范式三层（名字层/执行层/指导层/分发）闭环：封闭词表 0 手写副本单源注入、18→19 页 0 JSX 配置化、`ui:check` 十步质量门、AGENTS.md/skills/patterns.md 生成物 CI 钉新鲜度、消费端 typecheck 防线随 core 包零成本分发。
