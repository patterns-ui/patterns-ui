# Registry 构建与发布

## 1. 源与产物

- **源**：`registry/blocks/<category>/<name>/`（tsx 源码 + `<name>.meta.json`）与 `registry/themes/<preset>.json`。
- **产物**（`pnpm registry:build`，脚本 `registry/scripts/build.ts`）：
  - `registry/dist/r/<name>.json` —— 单个 registry-item JSON（shadcn registry-item schema）
  - `registry.json`（仓库根）—— 索引：`{ "$schema": ..., "name": "@fleetly/ui-components", "homepage": ..., "items": [...] }`，**提交进仓库**（GitHub repo-as-registry 入口）

## 2. meta.json 格式

```json
{
  "name": "data-table",
  "type": "registry:component",
  "title": "Data Table",
  "description": "TanStack Table v9 封装……",
  "categories": ["list"],
  "dependencies": ["@fleetly/ui-component-core@^0.0.0"],
  "registryDependencies": ["table", "dropdown-menu", "checkbox", "cells"],
  "targetDir": "components/blocks/list/data-table"
}
```

- `dependencies`：npm 依赖（带 semver）。`@fleetly/ui-component-core` 版本读 `packages/core/package.json` 自动填充。
- `registryDependencies`：裸名 = shadcn 内置件（button/table/…）；**列表里的目录内名字 = 我们的 block**（构建时改写为完整引用）。
- `targetDir`：安装目标目录（默认 `components/blocks/<category>/<name>`）。
- type 取值：组件 `registry:component`、页面模板 `registry:block`、主题 `registry:theme`。

## 3. 构建脚本行为

1. 扫描 `registry/blocks/**/**.meta.json` + `registry/themes/*.json`。
2. 每个 block：读目录内全部 `.tsx/.ts/.css` 文件 → `files: [{ path, target: "<targetDir>/<file>", type, content }]`。
3. 解析源码 import：
   - `@/components/blocks/<name>` → 加入 registryDependencies（避免循环声明则以 meta 为准校验）。
   - `@fleetly/ui-component-core` → npm dependencies。
   - `@/components/ui/*`、`@/lib/*` → 保留原样（用户项目别名解析）。
4. 校验：所有 registryDependencies 引用的 block 存在；无循环依赖（有则报错）；blocks 不得 import demo 代码。
5. 主题：生成 `registry:theme` item（cssVars + `[data-preset]` css 文件）。
6. 输出 `registry.json` + `dist/r/*.json`；执行 `pnpm dlx shadcn@latest registry validate`（CI 亦跑）。

## 4. 发布通道

- **主通道：GitHub repo-as-registry**（私有仓库，走 gh auth / GH_TOKEN）：
  ```bash
  npx shadcn add fleetlyrun/ui-components/data-table
  ```
  版本 pin：`npx shadcn add fleetlyrun/ui-components/data-table@0.3.0`（registryDependencies 内自引用 `name@semver`）。
- **副通道**：`dist/` 静态 JSON 可挂任意静态托管（将来需要时）。

## 5. 升级策略（文档化到 README「升级」一节）

1. 逻辑层升级走 npm（`@fleetly/ui-component-core` semver + changesets CHANGELOG）。
2. UI block 升级：
   ```bash
   npx shadcn add fleetlyrun/ui-components/data-table --dry-run   # 预览将变更的文件
   npx shadcn add fleetlyrun/ui-components/data-table --diff      # 与本地对比
   # 人工合并本地修改；确要覆盖时才 -o（会抹掉本地改动）
   ```
3. block 设计配合：文件少而内聚、公共 API 集中在单入口文件、重大变更出迁移说明（docs/ 下 migration 笔记）。
4. 建议用户锁 shadcn CLI 版本（避免 `@latest` 拉入未预期 major）。

## 6. 版本策略

- `packages/core` 用 changesets；minor = 新能力，patch = 修复，major = 破坏性。
- blocks 与 core 同节奏打 tag（`v0.x.y`），registry.json 内 `name@^x.y.z` 自引用跟随发布版本。
- 首个版本 `0.1.0`（M2 结束时发首个内部可用版）。
