# @fleetly/ui-components

给我们自己的 console / SaaS 项目用的 CRUD UI 底座：装上即得高完成度骨架，加资源页接近零样板。
- **技术栈**：pnpm monorepo · React 19 · TanStack Router / Query / Table v9 / Form v1 · shadcn/ui（Base UI 方言）· Tailwind v4 · zod v4
- **分发**：逻辑层 npm 包 `@fleetly/ui-component-core`（语义化版本 + changesets）+ UI 层 shadcn registry blocks（拷贝进项目、完全拥有、可任意改）
- **仓库**：`fleetlyrun/ui-components`（私有，repo-as-registry）

## 特性

| 能力                  | 说明                                                                                                                                                                                              |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 分层 L0–L4            | L0 Tokens（主题/主题 preset）→ L1 shadcn 基础件 → L2 复合组件（DataTable/FilterBar…）→ L3 页面模板（list-page/form-page/detail-page…）→ L4 `defineResource()` 资源声明层。每层可停、可换、可 fork |
| 列表四分页模式        | `useResourceTable` 一个 hook 覆盖 client（整取+本地过滤）/ server-offset（page+keepPreviousData）/ server-cursor（token 栈）/ load-more（累计拼接）                                               |
| URL 事实源            | 查询语义（搜索/过滤/排序/页码/视图）全部进 URL（zod schema 兜底坏值）；复制链接即还原，后退前进正确；cursor 栈与行选择留内存                                                                      |
| 资源层 createResource | queryKey/失效规则/三档 mutationMode（pessimistic / optimistic / **undoable**：乐观变更 + toast 倒计时撤销）统一封装，裸 fetch 零散请求为零                                                        |
| 租户                  | `/t/$tenantId` 路由前缀 + TenantProvider；queryKey 自动含租户段，切换租户精准清旧缓存；记忆（localStorage）+ 陈旧回落                                                                             |
| 认证与权限            | requireAuth/requireRole 路由守卫；`can()` 判定一律 fail-closed；`navFromResources` 按权限过滤导航                                                                                                 |
| 主题 preset           | dark 默认 + light；`data-preset` 切换主题皮肤（default / aurora），防闪阻塞脚本与 core 常量同源                                                                                                   |
| 时空处理              | 时区/hour12 偏好（Intl 缓存 + DST 正确）；formatRelative 活渲染                                                                                                                                   |
| L4 资源层             | `defineResource` 一份声明派生列表页、详情 loader 预取、导航、权限与表单字段推断（`inferColumns` / `inferFormFields`，dev 模式 Guesser 打印可粘贴配置）                                            |

## 新项目怎么用（三步）

前置：Node 22+、pnpm、GitHub 已登录（私有 registry 走 gh 凭据）。

```bash
# 0)（私有仓库需要）让 shadcn CLI 能读 fleetlyrun 仓库
gh auth login            # 或 export GH_TOKEN=ghp_xxx

# 1) 新项目：vite + TanStack Router 文件路由模板（或自有模板），装 Tailwind v4
pnpm create vite my-console --template react-ts
cd my-console && pnpm add tailwindcss @tailwindcss/vite && pnpm dev   # styles.css 加 @import "tailwindcss";

# 2) shadcn 初始化（Base UI 方言）并注册本仓库 registry
pnpm dlx shadcn@latest init -b base     # 生成 components.json / lib/utils 等
pnpm dlx shadcn@latest registry add @fleetly=gh:fleetlyrun/ui-components

# 3) 装 core 逻辑包 + 需要的 blocks（拷贝进 src/components/blocks/，完全可改）
pnpm add @fleetly/ui-component-core
pnpm dlx shadcn@latest add @fleetly/list-page @fleetly/data-table @fleetly/filter-bar
# 等价裸名形态（与 docs/registry.md §4 一致）：
pnpm dlx shadcn@latest add fleetlyrun/ui-components/list-page
```

版本 pin：`npx shadcn add fleetlyrun/ui-components/data-table@0.3.0`（registryDependencies 内自引用 `name@semver` 跟随发布版本）。

## 五分钟上手（L2 → L3 → L4）

以下示例均从 `apps/demo` 真实代码精简。同一资源在三层都能落地 —— 从 L2 开始，样板嫌多就往上爬一层。

### L2：DataTable + useResourceTable（自己装配）

```tsx
import { useResourceTable } from "@fleetly/ui-component-core/list";
import { servicesResource } from "@/resources"; // createResource({ name, client })
import { createListColumnHelper } from "@fleetly/ui-component-core/list";

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
// resources-m4.ts —— 声明即全部
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

// 路由文件（audit2.tsx）—— 两行装配
const listOptions = resourceListRouteOptions(auditDef); // validateSearch + staticData + 权限守卫
export const Route = createFileRoute("/_shell/t/$tenantId/audit2")({
  ...listOptions,
  component: () => <ResourceListView def={auditDef} />, // FilterBar+DataTable+分页+四态 全套
});
```

详情路由同样两行（`resourceDetailRouteOptions`：staticData + loader 走 createResource 同款 queryKey 预取），导航由 `navFromResources(defs, user)` 派生。实测与手写版功能等价、代码量约 1/3（见下方对比表）。

## Block 目录（75 blocks + 2 主题 preset = 77 items）

安装：`pnpm dlx shadcn@latest add @fleetly/<name>`。规格见 [docs/blocks.md](docs/blocks.md)。

| 分类                 | Blocks                                                                                                                                                                                                                                                           |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| shell（10）          | app-shell-inset / -floating / -fullbleed · top-bar · breadcrumbs · theme-toggle · preset-switcher · user-menu · command-palette · global-search-page                                                                                                             |
| sidebar（6）         | side-nav-inset / -floating / -icon · nav-group · nav-user · tenant-switcher                                                                                                                                                                                      |
| auth（5）            | sign-in-page · sign-up-page · forgot-password-page · otp-page · onboarding                                                                                                                                                                                       |
| list（14）           | data-table · filter-bar · facet-sidebar · saved-views-menu · pagination-bar · selection-bar · refresh-bar · new-items-banner · export-button · list-page（table/grid 双变体）· audit-log · notification-inbox · resource-list-view（L4）· use-resource-mutations |
| cells（10）          | cell-for（语义分发）· cell-id / -time / -user / -status / -boolean / -number / -enum-badge / -tags / -progress                                                                                                                                                   |
| form（8）            | typed-form-field（widget 全家 + createTypedForm 工厂）· form-page / form-sheet / form-dialog（三宿主）· stepper · confirm-dialog · reference-select · secret-reveal                                                                                              |
| show（9）            | detail-page · detail-grid · timeline · reference-field · inline-edit-field · danger-zone · record-pager · diff-viewer · resource-detail-view（L4）                                                                                                               |
| shared（11）         | async-state · empty-state · error-state · error-pages · skeleton · status-badge · relative-time · copy-button · user-avatar · resource-icon · stat-strip                                                                                                         |
| team / settings（2） | team-page · settings-page                                                                                                                                                                                                                                        |
| 主题（2）            | default · aurora（`[data-preset]` 皮肤，theme item 分发）                                                                                                                                                                                                        |

## 升级策略

- **逻辑层（core）**：走 npm semver。`@fleetly/ui-component-core` 的变更经 changesets 记录（本仓库 `pnpm changeset`），发版产 CHANGELOG；minor = 新能力，patch = 修复，major = 破坏性（docs/registry.md §6）。
- **UI blocks**：源码拷贝进项目后完全归你 —— 升级是「对比合并」而非覆盖：

  ```bash
  npx shadcn add fleetlyrun/ui-components/data-table --dry-run   # 预览将变更的文件
  npx shadcn add fleetlyrun/ui-components/data-table --diff      # 与本地对比
  # 人工合并本地修改；确要覆盖时才 -o（会抹掉本地改动）
  ```
- **建议锁 shadcn CLI 版本**（如 `pnpm dlx shadcn@4.22.1 add …`），避免 `@latest` 拉入未预期 major。
- block 设计配合升级：文件少而内聚、公共 API 集中在单入口文件、重大变更在 docs/ 出迁移笔记。

## L4 采用：defineResource 与手写版对比（M4）

同一份「审计事件列表页」（keyset 分页 + action facet + 时间范围过滤 + 高级 and/or）有两种写法，
demo 里并存可直接对比：

| 版本      | 路由             | 代码量                  | 说明                                                                                                                                                                     |
| --------- | ---------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M2 手写   | `/t/:tid/audit`  | ~229 行（单文件）       | 手写列定义 + useResourceTable + FilterBar/FacetSidebar/DataTable/PaginationBar 全套装配 + cursor/load-more 双模式切换                                                    |
| M4 资源层 | `/t/:tid/audit2` | ~87 行页面 + ~55 行 def | `defineResource`（列由 `inferColumns` 从样本推断、filters/list 一并声明）+ `resourceListRouteOptions`（validateSearch/staticData/权限守卫）+ `ResourceListView` 一行装配 |

资源层版本的收益随资源数量线性放大：def 还同时派生导航（`navFromResources`）、
详情路由 loader 预取（`resourceDetailRouteOptions`）与表单字段推断（`inferFormFields`）；
dev 模式打开 `/t/:tid/audit2` 可在控制台看到 Guesser 打印的可粘贴配置。
手写版保留为 L3 层参考（想完全掌控装配时停在该层即可）。

## demo 运行

```bash
pnpm install
pnpm dev          # 起 demo（含 mock API 中间件；登录账号 demo@fleetly.dev / 任意密码）
pnpm test         # core 单测 + demo 守卫测试
pnpm test:e2e     # Playwright 冒烟（需先装浏览器，见下）
pnpm build        # core 构建 + registry JSON 构建
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
packages/core/    # @fleetly/ui-component-core —— 纯逻辑 npm 包（hooks、数据约定、类型）
registry/         # UI blocks 源码（copy-paste 层事实源）+ 构建脚本
apps/demo/        # 开发场 / 活文档 / 新项目参考实现（Vite + TanStack Router + mock API）
docs/             # 规格文档（架构、core API、blocks、registry、里程碑验收）
```

### 里程碑状态

| 里程碑 | 内容                                                                                   | 状态 |
| ------ | -------------------------------------------------------------------------------------- | ---- |
| M0     | monorepo 骨架、registry 管线、demo alias 链                                            | ✅   |
| M1     | 壳与横切（theme/tenant/auth/router/datetime + shell/sidebar/auth blocks）              | ✅   |
| M2     | 列表纵切（data/filters/list core + 列表全家桶 blocks + services/audit 页）             | ✅   |
| M3     | 表单、详情与关联（form/reference/task core + 表单三宿主/show 系 blocks）               | ✅   |
| M4     | 资源层与高级表格（defineResource/inferColumns + 分组/树形/聚合/虚拟化 + SaaS 模板页）  | ✅   |
| M5     | 收尾（单测补全 128 + 守卫测试 12、Playwright 冒烟、CI、changesets、README、lint 收敛） | ✅   |

### 脚本

| 命令                                       | 作用                                                               |
| ------------------------------------------ | ------------------------------------------------------------------ |
| `pnpm dev`                                 | 起 demo（vite + mock API）                                         |
| `pnpm lint` / `pnpm format`                | biome 检查 / 格式化（0 warning 基线）                              |
| `pnpm -r typecheck`                        | 全 workspace tsc（demo 先 `tsr generate`）                         |
| `pnpm -r test`                             | core 单测（vitest）+ demo 守卫测试（node 环境源码扫描）            |
| `pnpm test:e2e`                            | Playwright 冒烟（webServer 自起 vite dev :4173）                   |
| `pnpm build`                               | core tsup 构建 + `registry:build`（registry.json + dist/r/*.json） |
| `pnpm dlx shadcn@latest registry validate` | 校验 registry.json（CI 亦跑）                                      |
| `pnpm changeset` / `pnpm version-packages` | 记录变更 / 提版本 + CHANGELOG（发版流程 docs/registry.md §6）      |

### 文档

- [docs/architecture.md](docs/architecture.md) —— 分层模型、状态哲学、依赖规则
- [docs/core-api.md](docs/core-api.md) —— 核心抽象完整 API 规格
- [docs/blocks.md](docs/blocks.md) —— 全部 registry blocks 规格
- [docs/registry.md](docs/registry.md) —— registry 构建发布与升级策略
- [docs/milestones.md](docs/milestones.md) —— M0–M5 任务分解与验收清单
