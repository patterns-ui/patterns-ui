# 架构规格

本文是 `@patterns-ui` 的架构契约，也是所有实现阶段的验收依据之一。

## 1. 定位

给我们自己的新 console/SaaS 项目用的底座。目标排序：

1. **新建同类项目装上即得高完成度骨架**（壳、认证、租户、列表、表单、详情一步到位）
2. **加资源页接近零样板**（`defineResource` 一份配置出四屏）
3. **长期维护成本最低**（逻辑薄、依赖少、约定清晰）

不追求开源生态通用性；不为不存在的需求做抽象。

## 2. 分层模型

```
L4  resource/        defineResource() 资源声明层（可选糖）
L3  Templates        整页模板：ListPage / DetailPage / FormPage(3宿主) / SignInPage / AppShell / SaaS 模板页
L2  Composites       复合组件：DataTable / FilterBar / PaginationBar / Cells / ConfirmDialog / ...
L1  Primitives       shadcn/ui（Base UI 方言）基础件 —— 引用不搬运
L0  Tokens           CSS 变量设计令牌 + 主题 preset 机制（纯 CSS）
```

**依赖规则（强制，验收时检查 import）：**

- `packages/core` **不得** import 任何 React UI 组件、shadcn、blocks；只依赖 `@tanstack/react-query`、`@tanstack/react-router`、`@tanstack/react-table`（list 模块用，均为 peer）、`zod`（peer）、`react`（peer）。运行依赖仅两件：`next-themes`（theme 模块）、`use-sync-external-store`（非 React 内置 store 订阅，auth/tenant 等，M6-B 起）。
- `registry/blocks/**` 可以 import：`@patterns-ui/core`、`@/components/ui/*`（shadcn 基础件）、`@/components/blocks/*`（其他 block）、`@/lib/*`、lucide-react 等运行库。**不得** import demo 应用代码。
- `apps/demo` 可以 import 一切；是唯一允许出现业务/ mock 代码的地方。
- 纯视觉组件（L2 以下）零路由依赖；需要路由的组件只经 `@tanstack/react-router` 的 `Link/useRouter/useSearch/useNavigate`。

**每层可停、可换、可 fork**：不用 L4 可以停在 L3 手工组装；不喜欢某个 block 可以改拷贝出来的源码（registry 哲学）；core 里每个 hook 可独立使用。

## 3. 状态哲学（本项目最重要的约定）

| 状态类别 | 归属 | 例子 |
|---|---|---|
| **查询语义** | **URL（search params / path）** | 搜索词、过滤器、排序、页码、页大小、load-more 页数、租户 ID、tab 深链 |
| **偏好语义** | **localStorage** | 列显隐/顺序/宽度、密度、侧栏折叠、主题（light/dark/preset）、时区、命名视图库、上次租户 |

推论：

- 列表页刷新/分享/后退必须完整还原状态。
- 偏好不进 URL（避免把个人偏好污染成全局链接），但命名视图例外地引用 URL 查询段（视图存的是查询串本身）。
- 任何新状态先归类：查询语义 → URL；偏好语义 → localStorage；两者都不属于 → 组件内部 state。

## 4. 仓库结构

```
patterns-ui/
├── pnpm-workspace.yaml            # packages: ['packages/*', 'apps/*']，共享依赖用 catalog
├── package.json                   # 根脚本：dev/build/test/lint/registry:build 等
├── tsconfig.base.json
├── biome.json
├── registry.json                  # 构建产物（GitHub registry 索引），提交进仓库
├── docs/                          # 本规格书系列
├── packages/core/                 # @patterns-ui/core
│   ├── package.json               # exports 子路径：./data ./list ./form ... ./resource ./datetime ./storage
│   ├── tsconfig.json
│   └── src/
│       ├── data/                  # Page/ListParams/ResourceClient 契约 + createResource + undoable 时序 + queryKey 工厂
│       ├── list/                  # useResourceTable + createListSearchSchema + URL 编解码
│       ├── filters/               # FilterDef/FilterTree 模型 + 客户端求值器
│       ├── form/                  # useResourceForm（宿主无关）+ 默认文案对象化
│       ├── reference/             # useReference
│       ├── tenant/                # TenantProvider/useTenant/记忆与校正
│       ├── auth/                  # AuthProvider 约定/守卫/can()
│       ├── router/                # 面包屑派生、列表 search schema 工厂
│       ├── task/                  # useTask 长任务轮询
│       ├── inline/                # useInlineEdit changeSet
│       ├── datetime/              # 时区偏好 + Intl 缓存 + 相对/绝对格式化 + isIsoDate
│       ├── resource/              # L4 defineResource + 推断/Guesser
│       ├── storage/               # createStorage 统一 localStorage（信封+版本+migrate；M6-B）
│       └── theme/                 # ThemeProvider（next-themes 薄封装 + preset）
├── registry/
│   ├── blocks/                    # block 源码，按类别分目录（kebab-case 文件名）
│   │   ├── shell/  sidebar/  list/  show/  form/  auth/  team/  settings/  shared/  cells/
│   │   └── <name>/<name>.tsx + <name>.meta.json
│   ├── themes/                    # 主题 preset 定义（JSON token 表）
│   └── scripts/build.ts           # 生成 dist/r/*.json + 根 registry.json + validate
└── apps/demo/
    ├── src/routes/                # TanStack Router 文件路由
    ├── src/components/ui/         # shadcn 基础件（Base UI 方言）
    ├── src/lib/                   # demo 的 mock client、api 封装、utils
    ├── src/mocks/                 # Vite dev/preview 中间件 mock API（内存存储；自包含——不 import @patterns-ui/core，否则 config 加载链依赖 core dist）
    ├── vite.config.ts             # @/components/blocks/* → registry/blocks/* alias + mock 中间件；dev 期 @patterns-ui/core → packages/core/src（干净 clone install+dev 即起）
    └── tsconfig.json              # 同上 alias 的 paths 映射
```

## 5. Block 源码的 import 约定（单一事实源的关键）

block 源码要**同时**在 demo 内直接开发运行、又能原样内联进 registry JSON 给用户项目。因此 block 内 import 只允许以下形态：

| import | demo 内解析为 | 用户项目内解析为 |
|---|---|---|
| `@/components/ui/button` | `apps/demo/src/components/ui/button.tsx` | 用户 components.json aliases（shadcn 标准） |
| `@/components/blocks/list/data-table` | `registry/blocks/list/data-table/`（tsconfig paths + vite alias） | registry 安装目标 `components/blocks/list/data-table/` |
| `@patterns-ui/core` | workspace 包 | npm 安装（registry item 的 `dependencies` 声明） |
| `@/lib/*`、`@/hooks/*` | demo 的 utils | 用户项目（registry item 里如需则随 item 附带 lib 文件） |

demo 的 `tsconfig.json` paths 与 `vite.config.ts` resolve.alias 必须包含：

```
"@/*"                       → "src/*"
"@/components/blocks/*"     → "../../registry/blocks/*"
```

**跨 block 依赖一律走 registryDependencies**（block 之间不拷贝源码副本），构建脚本据此填充 item 的 `registryDependencies`。

## 6. 技术栈与版本策略

- React 19 · TanStack Router ^1 · Query ^5 · Table ^9（只用 v9 正式 API：`tableFeatures()`/`useTable`/`table.state`/atoms，**禁止** v8 兼容层）· Form ^1（绑 `createFormHook` 组合 API + `useFieldContext`，禁止依赖废弃 API）· zod ^4（Standard Schema 直传，不引 adapter）。
- shadcn/ui Base UI 方言（`render` prop，不用 `asChild`）；Tailwind v4 CSS-first；Vite SPA；`next-themes`、`lucide-react`、`cmdk`、`sonner`。
- 具体版本在 M0 安装最新稳定版并由 pnpm catalog 统一管理；升级走 changesets 流程。
- 不做 SSR 承诺；core 内浏览器 API 访问（localStorage/window）一律收敛在 effect/事件处理器内，并统一导出 `mounted` 惯例，留将来余地。

## 7. 质量机制

- **biome**：lint + format 全仓。
- **vitest**：core 每个模块配单测（详见 milestones M5 清单）。
- **守卫测试（demo）**：扫描 `apps/demo/src` 禁止反模式——裸 `fetch`（必须走 mock client）、手拼资源 queryKey（必须经 createResource）、`window.confirm`、绕过 TenantProvider 直写租户 localStorage。把纪律变机制。
- **registry validate**：CI 跑 `shadcn registry validate` 校验产物。
- **Playwright 冒烟**（M5）：登录→列表过滤分页→详情→表单提交→undoable 删除 主链路。

## 8. 视觉基线（默认主题的偏好）

近黑中性画布 + 1px 发丝线边框 + 单一强调色 + `--status-success/warning/danger/info`（含 `-bg` 软底变体）+ sidebar 专属色板 + 字号阶梯（正文 14 / 次要 13 / 微标签 12 大写加字距 / 页题 22 / 大数 30 tabular-nums）+ 圆角阶梯（12/10/8）。暗色优先，light 完整支持。表格行高 ~52px，骨架行严格占位。这些落在 token 与 blocks 的默认样式里，可被 preset/覆盖修改。
