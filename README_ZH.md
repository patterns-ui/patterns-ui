# @patterns-ui

[English](README.md) · **简体中文**

给我们自己的 console / SaaS 项目用的 CRUD UI 底座：装上即得高完成度骨架，加资源页接近零样板。

- **技术栈**：pnpm monorepo · React 19 · TanStack Router / Query / Table v9 / Form v1 · shadcn/ui（Base UI 方言）· Tailwind v4 · zod v4
- **分发**：逻辑层 npm 包 `@patterns-ui/core`（语义化版本 + changesets）+ UI 层 shadcn registry blocks（拷贝进项目、完全拥有、可任意改）
- **仓库**：`patterns-ui/patterns-ui`（私有，repo-as-registry）
- **许可证**：MIT（[LICENSE](LICENSE)）

## 范式：原型 + 封闭词表

这个库不卖组件也不卖设计——卖的是**可快速借鉴、行为一致的业务模式**。页面工作 = **写配置，不写 JSX**：

- **七个页面原型**（resource-list / resource-detail / resource-form / settings / overview / auth-flow / wizard），每个原型一套固定 slot 结构；变体一律是 prop，不是平行 block。
- **封闭词表**：73 blocks · 9 语义 cells · 2 主题 preset · 10 action · 3 分页协议（`page` / `keyset` 已实现，`offset` 保留值）。页面文件只写词表内的名字，写错由 typecheck 报错并列出全部合法值。
- **事实层**：[docs/patterns.md](docs/patterns.md)（生成物——`pnpm docs:generate`，勿手编）：原型判定表、判别式、词表目录、取材真实 demo 页面的 18 个精选组合、8 条反模式。
- **五个业务模式**（audit-log、notification、onboarding、settings、team），以契约卡分发：命中即用组装入口 block + client 适配器一行装配。
- **强制层**：范式 eslint 插件（4 规则）、`ui:check` 十步质量门、一致性分数棘轮、三态截图基线。生成物（`AGENTS.md`、`docs/patterns.md`、词表）由 CI 钉住新鲜度。

词表真缺组件时，唯一合法路径是 sandbox 棘轮（登记 + 水印 + 查重 + 晋升，走 `ui-block` skill）；品牌定制只动 theme token（`ui-theme` skill）。

## 特性

| 能力 | 说明 |
| --- | --- |
| 分层 L0–L4 | L0 Tokens（主题/主题 preset）→ L1 shadcn 基础件 → L2 复合组件（DataTable/FilterBar…）→ L3 页面模板（list-page/form-page/detail-page…）→ L4 `defineResource()` 资源声明层。每层可停、可换、可 fork |
| 列表四分页模式 | `useResourceTable` 一个 hook 覆盖 client（整取+本地过滤）/ server-offset（page+keepPreviousData）/ server-cursor（token 栈）/ load-more（累计拼接） |
| URL 事实源 | 查询语义（搜索/过滤/排序/页码/视图）全部进 URL（zod schema 兜底坏值）；复制链接即还原，后退前进正确；cursor 栈与行选择留内存 |
| 资源层 | `createResource` 统一封装 queryKey、失效规则与三档 mutationMode（pessimistic / optimistic / **undoable**：乐观变更 + toast 倒计时撤销），裸 fetch 零散请求为零 |
| 多租户 | `/t/$tenantId` 路由前缀 + TenantProvider；queryKey 自动含租户段，切换租户精准清旧缓存；记忆（localStorage）+ 陈旧回落 |
| 认证与权限 | requireAuth/requireRole 路由守卫；`can()` 判定一律 fail-closed；`navFromResources` 按权限过滤导航 |
| 主题 preset | dark 默认 + light；`data-preset` 切换主题皮肤（default / aurora），防闪阻塞脚本与 core 常量同源 |
| 时空处理 | 时区/hour12 偏好（Intl 缓存 + DST 正确）；formatRelative 活渲染 |
| L4 资源层 | `defineResource` 一份声明派生列表页、详情 loader 预取、导航、权限与表单字段推断（`inferColumns` / `inferFormFields`，dev 模式 Guesser 打印可粘贴配置） |

## 新项目怎么用（三步）

前置：Node 22+、pnpm、GitHub 已登录（私有 registry 走 gh 凭据）。

```bash
# 0)（私有仓库需要）让 shadcn CLI 能读 patterns-ui 组织仓库
gh auth login            # 或 export GH_TOKEN=ghp_xxx

# 1) 新项目：vite + TanStack Router 文件路由模板（或自有模板），装 Tailwind v4
pnpm create vite my-console --template react-ts
cd my-console && pnpm add tailwindcss @tailwindcss/vite && pnpm dev   # styles.css 加 @import "tailwindcss";

# 2) shadcn 初始化（Base UI 方言）并注册本仓库 registry
pnpm dlx shadcn@latest init -b base     # 生成 components.json / lib/utils 等
pnpm dlx shadcn@latest registry add @patterns-ui=gh:patterns-ui/patterns-ui

# 3) 装 core 逻辑包 + 需要的 blocks（拷贝进 src/components/blocks/，完全可改）
pnpm add @patterns-ui/core
pnpm dlx shadcn@latest add @patterns-ui/list-page @patterns-ui/data-table @patterns-ui/filter-bar
# 等价裸名形态（与 docs/registry.md §4 一致）：
pnpm dlx shadcn@latest add patterns-ui/patterns-ui/list-page
```

版本 pin：`npx shadcn add patterns-ui/patterns-ui/data-table@0.3.0`（registryDependencies 内自引用 `name@semver` 跟随发布版本）。

## 五分钟上手（L2 → L3 → L4）

以下示例均从 `apps/demo` 真实代码精简。同一资源在三层都能落地——从 L2 开始，样板嫌多就往上爬一层。

### L2：DataTable + useResourceTable（自己装配）

```tsx
import { useResourceTable } from "@patterns-ui/core/list";
import { servicesResource } from "@/resources"; // createResource({ name, client })
import { createListColumnHelper } from "@patterns-ui/core/list";

const helper = createListColumnHelper<Service>();
const columns = [helper.accessor("name", { header: "名称" }) /* … */];

const list = useResourceTable<Service>({
  resource: servicesResource,
  mode: "server-offset", // 或 client / server-cursor / load-more
  columns,
  filters: FILTER_DEFS, // FilterDef[] → FilterBar 直接消费
  facets: ["env", "status"],
  search: { fields: ["name", "id"] },
  sort: { initial: [{ field: "name", direction: "asc" }], multi: true },
});

<DataTable table={list.table} preferencesKey="services" mobile="cards" />;
```

搜索/过滤/排序/页码自动写 URL（`createListSearchSchema` 生成路由 `validateSearch`），翻页 keepPreviousData，四态（loading/空/空过滤/错误）由 `AsyncState` 接住。

### L3：ListPage 页面模板（一块拼完一页）

```tsx
import { ListPage } from "@/components/blocks/list/list-page/list-page";
import { AsyncState } from "@/components/blocks/shared/async-state/async-state";
import { FilterBar } from "@/components/blocks/list/filter-bar/filter-bar";
import { PaginationBar } from "@/components/blocks/list/pagination-bar/pagination-bar";

<ListPage
  title="Services"
  filter={<FilterBar list={list} defs={FILTER_DEFS} onRefresh={() => void list.query.refetch()} />}
  body={
    <AsyncState
      query={list.query}
      rowsEmpty={rows.length === 0}
      onClearFilters={() => list.reset()}
    >
      <DataTable table={list.table} preferencesKey="services" />
    </AsyncState>
  }
  footer={<PaginationBar list={list} />}
/>;
```

### L4：defineResource（一份声明，整页 + 路由 + 导航 + 权限）

```tsx
// resources.ts —— 声明即全部
export const auditDef = defineResource<AuditEvent>({
  name: "audit-events",
  client: createRestClient((tid) => `/api/t/${tid}/audit-events`),
  columns: inferColumns(AUDIT_SAMPLE).columns, // 样本推断列（id/time/enum…）
  filters: [
    /* FilterDef… */
  ],
  list: { mode: "server-cursor", facets: ["action"] },
  nav: { group: "Data", icon: "scroll-text" },
});

// 路由文件（audit.tsx）—— 两行装配
const listOptions = resourceListRouteOptions(auditDef); // validateSearch + staticData + 权限守卫
export const Route = createFileRoute("/_shell/t/$tenantId/audit")({
  ...listOptions,
  component: () => <ResourceListView def={auditDef} />, // FilterBar+DataTable+分页+四态 全套
});
```

详情路由同样两行（`resourceDetailRouteOptions`：staticData + loader 走 createResource 同款 queryKey 预取），导航由 `navFromResources(defs, user)` 派生。实测与手写版功能等价、代码量约 1/3（见下方对比表）。

## Block 目录（73 blocks + 2 主题 preset + 1 skills item = 76 items）

安装：`pnpm dlx shadcn@latest add @patterns-ui/<name>`。规格见 [docs/blocks.md](docs/blocks.md)。

| 分类 | Blocks |
| --- | --- |
| shell（8） | app-shell（variant：inset/floating/fullbleed）· top-bar · breadcrumbs · theme-toggle · preset-switcher · user-menu · command-palette · global-search-page |
| sidebar（4） | side-nav（variant：inset/floating/icon）· nav-group · nav-user · tenant-switcher |
| auth（6） | auth-card-layout · sign-in-page · sign-up-page · forgot-password-page · otp-page · onboarding |
| list（14） | data-table · filter-bar · facet-sidebar · saved-views-menu · pagination-bar · selection-bar · refresh-bar · new-items-banner · export-button · list-page（table/grid 双变体）· audit-log · notification-inbox · resource-list-view（L4）· use-resource-mutations |
| cells（10） | cell-for（语义分发）· cell-id / -time / -user / -status / -boolean / -number / -enum-badge / -tags / -progress |
| form（8） | typed-form-field（widget 全家 + createTypedForm 工厂）· form-page / form-sheet / form-dialog（三宿主）· stepper · confirm-dialog · reference-select · secret-reveal |
| show（9） | detail-page · detail-grid · timeline · reference-field · inline-edit-field · danger-zone · record-pager · diff-viewer · resource-detail-view（L4） |
| shared（12） | async-state · empty-state · error-state · error-pages（ErrorPage 单模板 + RouteErrorBoundary）· page-header · skeleton · status-badge · relative-time · copy-button · user-avatar · resource-icon · stat-strip |
| team / settings（2） | team-page · settings-page（组织/个人/安全/外观四节） |
| 主题（2） | default · aurora（`[data-preset]` 皮肤，theme item 分发） |
| skills（1） | skills（三份 agent skill + 渲染脚本，`registry:file` item——见下「AI / skills」） |

## AI / skills（双通道）

三份 agent skill 与本仓库范式配套（正文 M7-C3、分发 M7-D，paradigm §4.2/§4.3）：

- **ui-page**：建/改页面总入口（分类原型 → 抄 patterns 精选组合 → 写配置 0 JSX → typecheck / `ui:check` 自检 → 三态截图交付）。
- **ui-block**：词表真缺组件的唯一合法路径（查重 → sandbox 落位+水印 → proposed 登记 → freeze 豁免 → 晋升）。
- **ui-theme**：品牌定制唯一入口（preset 选择；只改 theme token，逐组件调色是反模式）。

消费端分发走**双通道**：

- **通道一 —— registry item（按项目渲染）**：

  ```bash
  npx shadcn add patterns-ui/patterns-ui/skills
  node .patterns-ui/skills/render-skills.mjs                 # 渲染到 .claude/.zcode/.agents 三宿主 skills 目录
  node .patterns-ui/skills/render-skills.mjs --host claude   # 只渲染所选宿主（zcode / agents 同理）
  ```

  `shadcn add` 把三份 SKILL.md + 渲染脚本落在 `.patterns-ui/skills/`（`~` target = 项目根）。渲染脚本按项目形态微调正文（pages 目录前缀 `--pages-dir`、包管理器 `--pm` 按 lockfile 探测并改写命令、剥离仓内同步尾注、附消费端词表事实源提示）——「按消费项目生成变体」的最小自实现。

- **通道二 —— skills.sh 静态源（生态主渠道）**：`npx skills add patterns-ui/patterns-ui`（[skills.sh](https://skills.sh)，Vercel 开源 CLI）。skills CLI 的标准扫描目录包含 `.claude/skills/` 与 `.agents/skills/`——本仓库三宿主目录单一源结构**原生兼容，无需额外布局**（容器目录三层深扫描，`<skill>/SKILL.md` 即条目）。静态源分发的是仓内原版（正文引用 patterns-ui 仓内路径），需要项目内适配时走通道一；仓库私有时按 skills CLI 的私有源约定安装（需本机 GitHub 认证）。

仓内事实源 = `.zcode/skills/`（`ui-page` / `ui-block` / `ui-theme` 三 SKILL.md；`.claude/skills/`、`.agents/skills/` 为逐字节一致副本，CI `diff -r` 校验同步）。

## 升级策略

- **逻辑层（core）**：走 npm semver。`@patterns-ui/core` 的变更经 changesets 记录（本仓库 `pnpm changeset`），发版产 CHANGELOG；minor = 新能力，patch = 修复，major = 破坏性（docs/registry.md §6）。
- **UI blocks**：源码拷贝进项目后完全归你——升级是「对比合并」而非覆盖：

  ```bash
  npx shadcn add patterns-ui/patterns-ui/data-table --dry-run   # 预览将变更的文件
  npx shadcn add patterns-ui/patterns-ui/data-table --diff      # 与本地对比
  # 人工合并本地修改；确要覆盖时才 -o（会抹掉本地改动）
  ```

- 建议锁 shadcn CLI 版本（如 `pnpm dlx shadcn@4.22.1 add …`），避免 `@latest` 拉入未预期 major。
- block 设计配合升级：文件少而内聚、公共 API 集中在单入口文件、重大变更在 docs/ 出迁移笔记。

## L4 采用：defineResource 与手写版对比（M4）

同一份「审计事件列表页」（keyset 分页 + action facet + 时间范围过滤 + 高级 and/or）有两种写法，demo 里并存可直接对比（M6 后产品入口是 L4 版 `/t/:tid/audit`；M2 手写版移至 `/t/:tid/dev/audit-legacy` 工具参照页）：

| 版本 | 路由 | 代码量 | 说明 |
| --- | --- | --- | --- |
| M2 手写 | `/t/:tid/dev/audit-legacy` | ~229 行（单文件） | 手写列定义 + useResourceTable + FilterBar/FacetSidebar/DataTable/PaginationBar 全套装配 + cursor/load-more 双模式切换 |
| M4 资源层 | `/t/:tid/audit` | ~87 行页面 + ~55 行 def | `defineResource`（列由 `inferColumns` 从样本推断、filters/list 一并声明）+ `resourceListRouteOptions`（validateSearch/staticData/权限守卫）+ `ResourceListView` 一行装配 |

资源层版本的收益随资源数量线性放大：def 还同时派生导航（`navFromResources`）、详情路由 loader 预取（`resourceDetailRouteOptions`）与表单字段推断（`inferFormFields`）；dev 模式打开 `/t/:tid/audit` 可在控制台看到 Guesser 打印的可粘贴配置。手写版保留为 L3 层参考（想完全掌控装配时停在该层即可）。

## demo 运行

```bash
pnpm install
pnpm dev          # 起 demo（含 mock API 中间件；登录账号 demo@fleetly.dev / 任意密码）——干净 clone 到这一步即可起（dev 期 core 走 workspace 源码 alias，无需先 build）
pnpm test         # core 单测 + demo 守卫测试
pnpm test:e2e     # Playwright 冒烟（需先装浏览器，见下；CI 随 PR/push 跑）
pnpm build        # core 构建 + registry JSON 构建
pnpm review       # demo 生产构建 + preview 自测（vite build && vite preview，:4173 钉死）
```

浏览器二进制（Ubuntu 26.04+ 需平台覆盖；CI 的 ubuntu-24.04 不需要）：

```bash
pnpm --filter demo exec playwright install chromium
# Ubuntu 26.04 本机如遇 "does not support chromium on ubuntuXX"：
PLAYWRIGHT_HOST_PLATFORM_OVERRIDE=ubuntu24.04-x64 pnpm --filter demo exec playwright install chromium
```

<!-- TODO: 截图位 —— 登录页 / 壳+侧栏 / services 列表（过滤+分页）/ 详情 tabs / 表单分区 / 主题 preset 对比（aurora vs default）。补图时放 docs/screenshots/ 并在此引用。 -->

## 开发（本仓库）

```
packages/core/            # @patterns-ui/core —— 纯逻辑 npm 包（hooks、数据约定、类型）
packages/eslint-plugin/   # @patterns-ui/eslint-plugin —— 范式 lint（private，仅本仓 CI；npm 发布推迟至有真实外部消费者，M7-D 定案 4）
registry/                 # UI blocks 源码（copy-paste 层事实源）+ 构建脚本 + skills 通道一 item（registry/skills/）
apps/demo/                # 开发场 / 活文档 / 新项目参考实现（Vite + TanStack Router + mock API）
docs/                     # 规格文档（架构、core API、blocks、registry、范式、patterns、里程碑验收）
```

### 里程碑

| 里程碑 | 内容 | 状态 |
| --- | --- | --- |
| M0 | monorepo 骨架、registry 管线、demo alias 链 | ✅ |
| M1 | 壳与横切（theme/tenant/auth/router/datetime + shell/sidebar/auth blocks） | ✅ |
| M2 | 列表纵切（data/filters/list core + 列表全家桶 blocks + services/audit 页） | ✅ |
| M3 | 表单、详情与关联（form/reference/task core + 表单三宿主/show 系 blocks） | ✅ |
| M4 | 资源层与高级表格（defineResource/inferColumns + 分组/树形/聚合/虚拟化 + SaaS 模板页） | ✅ |
| M5 | 收尾（单测补全 128 + 守卫测试 12、Playwright 冒烟、CI、changesets、README、lint 收敛） | ✅ |
| M6 | 地基与结构修复（发布就绪/结构归位/L4 健壮化/变体收敛/文案与文档收尾，见 docs/milestones.md） | ✅ |
| M7 | 范式落地（名字层 + 执行层 + 指导层 + 分发；`ui:check` 一条龙质量门，见 docs/milestones.md） | ✅ |

### 脚本

| 命令 | 作用 |
| --- | --- |
| `pnpm dev` | 起 demo（vite + mock API） |
| `pnpm lint` / `pnpm format` | biome 检查 / 格式化（0 warning 基线） |
| `pnpm -r typecheck` | 全 workspace tsc（demo 先 `tsr generate`） |
| `pnpm -r test` | core 单测（vitest）+ demo 守卫测试（node 环境源码扫描） |
| `pnpm test:e2e` | Playwright 冒烟（webServer 自起 vite dev :4173；CI 随 PR/push 跑） |
| `pnpm build` | core tsup 构建 + `registry:build`（registry.json + dist/r/*.json） |
| `pnpm review` | demo `vite build && vite preview`（:4173 钉死；CI 冒烟探活） |
| `pnpm lint:eslint` / `pnpm slots:check` | 范式 lint 四规则（M7-B1）/ archetype slot 三方一致（M7-B1） |
| `pnpm ui:shots [--check]` | 三态截图基线生成 / CI 校验（M7-B2） |
| `pnpm ui:score [--check]` | 一致性分数报告 / 棘轮校验（M7-B3） |
| `pnpm check:names` | 三方一致核对：配置名字 ⊆ 注入表 ∪ sandbox 登记表（M7-B4） |
| `pnpm ui:a11y` | axe 扫描（wcag2a/2aa；serious/critical 败，moderate 留账） |
| `pnpm ui:check [--fast\|--skip 7,shots]` | 一条龙 10 步质量门（M7-B4；`--fast` 静态快跑，`--list` 看全表） |
| `pnpm dlx shadcn@latest registry validate` | 校验 registry.json（CI 亦跑） |
| `pnpm changeset` / `pnpm version-packages` | 记录变更 / 提版本 + CHANGELOG（发版流程 docs/registry.md §6） |

### 文档

- [docs/architecture.md](docs/architecture.md) —— 分层模型、状态哲学、依赖规则
- [docs/paradigm.md](docs/paradigm.md) —— 范式与定位设计契约（原型 + 封闭词表 + AI 指导机制；M6–M8）
- [docs/patterns.md](docs/patterns.md) —— 事实层（生成物）：原型判定表、判别式、词表、精选组合、反模式
- [docs/core-api.md](docs/core-api.md) —— 核心抽象完整 API 规格
- [docs/blocks.md](docs/blocks.md) —— 全部 registry blocks 规格
- [docs/registry.md](docs/registry.md) —— registry 构建发布与升级策略
- [docs/milestones.md](docs/milestones.md) —— M0–M7 任务分解与验收清单
