# Registry 构建与发布

## 1. 源与产物

- **源**：`registry/blocks/<category>/<name>/`（tsx 源码 + `<name>.meta.json`）与 `registry/themes/<preset>.json`。
- **产物**（`pnpm registry:build`，脚本 `registry/scripts/build.ts`）：
  - `registry/dist/r/<name>.json` —— 单个 registry-item JSON（shadcn registry-item schema）
  - `registry.json`（仓库根）—— 索引：`{ "$schema": ..., "name": "@patterns-ui", "homepage": ..., "items": [...] }`，**提交进仓库**（GitHub repo-as-registry 入口）

## 2. meta.json 格式

```json
{
  "name": "data-table",
  "type": "registry:component",
  "title": "Data Table",
  "description": "TanStack Table v9 封装……",
  "categories": ["list"],
  "dependencies": ["@patterns-ui/core@^0.0.0"],
  "registryDependencies": ["table", "dropdown-menu", "checkbox", "cells"],
  "targetDir": "components/blocks/list/data-table"
}
```

- `dependencies`：npm 依赖（带 semver）。`@patterns-ui/core` 版本读 `packages/core/package.json` 自动填充；源码 import 的裸 npm 包（如 `@tanstack/react-query`）自动并入——只有 react 系（react/react-dom/react/jsx-runtime、`react/*`）视为宿主自带不声明。
- `registryDependencies` 的三种写法与构建期改写（**产物中永不出现裸名**——裸名永远解析到官方 shadcn）：
  - 裸名命中我方 block 名 → 改写为 GitHub 完整引用 `patterns-ui/patterns-ui/<name>`（§4 主通道）；
  - 其余裸名（button/table/dropdown-menu…官方件）→ 改写为 `https://ui.shadcn.com/r/styles/base-nova/<name>.json` 完整 URL（**方言钉扎点** `OFFICIAL_BASE_REGISTRY`，见 build.ts——消费端 components.json 的 style 不再影响我们 item 的方言）；
  - 已含 `/` 的引用（完整 URL / `owner/repo/item` / `@ns/item`）→ 原样保留。
- `targetDir`：安装目标目录（默认 `components/blocks/<category>/<name>`）。
- type 取值：组件 `registry:component`、页面模板 `registry:block`、主题 `registry:theme`。

## 3. 构建脚本行为

1. 扫描 `registry/blocks/**/**.meta.json` + `registry/themes/*.json`。
2. 每个 block：读目录内全部 `.tsx/.ts/.css` 文件 → `files: [{ path, target: "<targetDir>/<file>", type, content }]`。
3. 解析源码 import：
   - `@/components/blocks/<name>` → registryDependencies（改写为 `patterns-ui/patterns-ui/<name>` 完整引用）。
   - `@/components/ui/<name>` → 钉扎为官方 base-nova 完整 URL 并入 registryDependencies（ui 别名永远指官方，即使存在同名我方 block）；barrel import `@/components/ui`（无具体名）构建直接 fail。
   - `@patterns-ui/core` → npm dependencies。
   - `@/lib/*`、`@/hooks/*` → 保留原样（用户项目别名解析）。
4. 校验：所有 registryDependencies 引用的 block 存在；无循环依赖（有则报错）；blocks 不得 import demo 代码。
5. 主题：生成 `registry:theme` item（**仅 css 文件，不带 cssVars 字段**）。每个 preset css 文件自含 `@theme inline` 段（全部令牌 → `--color-*` 一对一映射 + radius 派生四档，口径与 apps/demo/src/styles.css 一致）——消费端只 add 一个 theme item、`@import` 落盘 css 即可用全部语义色/radius utility。不带 cssVars 的原因：CLI 对 registry:theme 的 cssVars 物化会向消费端 index.css 追加自生成的 `@theme inline`，其 var 引用双写前导横线（`var(----x)`，shadcn@4.21/4.22 实测，官方标准 token 一并损坏），且 `:root`/`.dark` 平铺物化与我们的 `data-preset` 多 preset 切换语义冲突——theme 的唯一交付面是自含 css 文件。
6. 输出 `registry.json` + `dist/r/*.json`；CI 以 `git diff --exit-code` 校验产物新鲜度，`pnpm dlx shadcn@latest registry validate` 校验 schema；`registry-consumer` job 跑消费端冒烟（`pnpm registry:smoke`）。

## 4. 发布通道

- **主通道：GitHub repo-as-registry**（私有仓库，走 gh auth / GH_TOKEN）：
  ```bash
  npx shadcn add patterns-ui/patterns-ui/data-table
  ```
  版本 pin：`npx shadcn add patterns-ui/patterns-ui/data-table@0.3.0`（registryDependencies 内自引用 `name@semver`）。
- **副通道**：`dist/` 静态 JSON 可挂任意静态托管（将来需要时）。

## 5. 升级策略（文档化到 README「升级」一节）

1. 逻辑层升级走 npm（`@patterns-ui/core` semver + changesets CHANGELOG）。
2. UI block 升级：
   ```bash
   npx shadcn add patterns-ui/patterns-ui/data-table --dry-run   # 预览将变更的文件
   npx shadcn add patterns-ui/patterns-ui/data-table --diff      # 与本地对比
   # 人工合并本地修改；确要覆盖时才 -o（会抹掉本地改动）
   ```
3. block 设计配合：文件少而内聚、公共 API 集中在单入口文件、重大变更出迁移说明（docs/ 下 migration 笔记）。
4. 建议用户锁 shadcn CLI 版本（避免 `@latest` 拉入未预期 major）。

## 6. 版本策略

- `packages/core` 用 changesets；minor = 新能力，patch = 修复，major = 破坏性。
- blocks 与 core 同节奏打 tag（`v0.x.y`），registry.json 内 `name@^x.y.z` 自引用跟随发布版本。
- 首个版本 `0.1.0`（M2 结束时发首个内部可用版）。
