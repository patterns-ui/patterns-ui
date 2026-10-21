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

## 状态

按里程碑推进中，见 [docs/milestones.md](docs/milestones.md)。
