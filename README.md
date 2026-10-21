# @fleetly/ui-components

给我们自己的 console / SaaS 项目用的 CRUD UI 底座：装上即得高完成度骨架，加资源页接近零样板。
- **技术栈**：pnpm monorepo · React 19 · TanStack Router / Query / Table v9 / Form v1 · shadcn/ui（Base UI 方言）· Tailwind v4 · zod v4
- **分发**：逻辑层 npm 包 `@fleetly/ui-component-core`（语义化版本）+ UI 层 shadcn registry blocks（拷贝进项目、完全拥有、可任意改）
- **分层**：L0 Tokens → L1 shadcn 基础件 → L2 复合组件 → L3 页面模板 → L4 `defineResource()` 资源声明层。每层可停、可换、可 fork。

## 仓库结构

```
packages/core/    # @fleetly/ui-component-core —— 纯逻辑 npm 包（hooks、数据约定、类型）
registry/         # UI blocks 源码（copy-paste 层事实源）+ 构建脚本
apps/demo/        # 开发场 / 活文档 / 新项目参考实现（Vite + TanStack Router + mock API）
docs/             # 规格文档（架构、core API、blocks、registry、里程碑验收）
```

## 快速开始（demo）

```bash
pnpm install
pnpm dev          # 起 demo（含 mock API 中间件）
pnpm test         # 全部单测
pnpm build        # core 构建 + registry JSON 构建
```

## 文档

- [docs/architecture.md](docs/architecture.md) —— 分层模型、状态哲学、依赖规则
- [docs/core-api.md](docs/core-api.md) —— 核心抽象完整 API 规格
- [docs/blocks.md](docs/blocks.md) —— 全部 registry blocks 规格
- [docs/registry.md](docs/registry.md) —— registry 构建发布与升级策略
- [docs/milestones.md](docs/milestones.md) —— M0–M5 任务分解与验收清单

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

## 状态

按里程碑推进中，见 [docs/milestones.md](docs/milestones.md)。
