# Registry 构建与发布

## 1. 源与产物

- **源**：`registry/blocks/<category>/<name>/`（tsx 源码 + `<name>.meta.json`）与 `registry/themes/<preset>.json`。
- **产物**（`pnpm registry:build`，脚本 `registry/scripts/build.ts`）：
  - `registry/dist/r/<name>.json` —— 单个 registry-item JSON（shadcn registry-item schema）
  - `registry.json`（仓库根）—— 索引：`{ "$schema": ..., "name": "@patterns-ui", "homepage": ..., "items": [...] }`，**提交进仓库**（GitHub repo-as-registry 入口）
  - `packages/core/src/vocab/blocks.generated.ts` —— 词表生成物（`pnpm vocab:generate`，见 §3），**提交进仓库**

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

原型宿主/预设 block（如 `list-page`）额外带可选字段，位置紧跟 `categories`：

```json
"categories": ["list"],
"archetype": "resource-list",
```

- `dependencies`：npm 依赖（带 semver）。`@patterns-ui/core` 版本读 `packages/core/package.json` 自动填充；源码 import 的裸 npm 包（如 `@tanstack/react-query`）自动并入——只有 react 系（react/react-dom/react/jsx-runtime、`react/*`）视为宿主自带不声明。
- `archetype`（可选）：页面原型归属，合法值 7 个（`resource-list` / `resource-detail` / `resource-form` / `settings` / `overview` / `auth-flow` / `wizard`，paradigm.md §3.2）。语义 = 该 block 是哪个原型的**宿主/预设**（如 list-page → resource-list、form-dialog/form-sheet/form-page → resource-form）；仅原型宿主/预设声明，其余 block 不写。构建校验非法值失败；`vocab:generate` 据此产 `BLOCKS_BY_ARCHETYPE`；M7-B1 消费做同原型 slot 结构一致性校验。
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
4. 校验：所有 registryDependencies 引用的 block 存在；无循环依赖（有则报错）；blocks 不得 import demo 代码；`meta.archetype`（可选）∈ 7 原型，非法值构建失败，合法值透传到 registry item 顶层（schema 顶层 additionalProperties 开放，validate 不拒）。
5. 主题：生成 `registry:theme` item（**仅 css 文件，不带 cssVars 字段**）。每个 preset css 文件自含 `@theme inline` 段（全部令牌 → `--color-*` 一对一映射 + radius 派生四档，口径与 apps/demo/src/styles.css 一致）——消费端只 add 一个 theme item、`@import` 落盘 css 即可用全部语义色/radius utility。不带 cssVars 的原因：CLI 对 registry:theme 的 cssVars 物化会向消费端 index.css 追加自生成的 `@theme inline`，其 var 引用双写前导横线（`var(----x)`，shadcn@4.21/4.22 实测，官方标准 token 一并损坏），且 `:root`/`.dark` 平铺物化与我们的 `data-preset` 多 preset 切换语义冲突——theme 的唯一交付面是自含 css 文件。
6. 输出 `registry.json` + `dist/r/*.json`；CI 以 `git diff --exit-code` 校验产物新鲜度（词表生成物同入校验，见下），`pnpm dlx shadcn@latest registry validate` 校验 schema；`registry-consumer` job 跑消费端冒烟（`pnpm registry:smoke`）。
7. **词表生成器**（`registry/scripts/generate-blocks.ts`，`pnpm vocab:generate`）：读全部 meta.json + themes/*.json，产出 `packages/core/src/vocab/blocks.generated.ts`（`ARCHETYPES`/`CELL_NAMES`/`BLOCK_NAMES`/`BLOCKS_BY_ARCHETYPE`/`THEME_PRESET_NAMES` 及派生类型与 `*_DOCS`，形态见 paradigm.md §3.3 (2)）。确定性：名字码位排序、格式经 biome canonicalize，连跑两次零 diff。**生成物提交进 git**；根 `build` 先 `vocab:generate` 再构建 core（词表先于 core 构建）；CI 在 build 后重跑并纳入 freshness diff（改 meta 不重新生成 = 红）；core 侧 `blocks.test.ts` 另有单源与新鲜度单测兜底。

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

## 7. meta 冻结与范式 lint（M7-B1）

### 7.1 冻结清单 `registry/.freeze.json`

- **语义**：路径（block 目录名 `<category>/<name>`）、`name`、`targetDir` **三不变**；内容可变（哈希不冻结——改源码不影响）。与 §2「永不改名纪律」同源：改名/移动会断消费端 `registryDependencies` 与安装路径。
- **生成**：`pnpm --filter @patterns-ui/eslint-plugin freeze:regen`（`packages/eslint-plugin/scripts/generate-freeze.mjs`）。确定性生成物（键排序、无时间戳，连跑两次零 diff），提交进 git。
- **执行**：eslint 规则 `patterns-ui/registry-frozen`（清单不存在 / 新增目录未登记 / name·targetDir 漂移 / 清单目录消失 → error）。目录归属按**路径**判定（`registry/blocks/<category>/<block>` 两层），meta 文件名不参与——半改名（目录复制/目录名与 meta.name 不一致）同样命中，与 build.ts 的位置扫描口径一致。
- **豁免流程**：重新生成清单（`freeze:regen`）+ PR 附理由。新增 block = 合规改动走此流程；改名/删除原则拒绝（词表断链），确须变更须在 PR 说明迁移方案。

### 7.2 范式 lint（@patterns-ui/eslint-plugin）

自定义规则走 eslint（biome 不支持自定义规则）；**作用域仅 `apps/demo/src/pages/**` 与 `registry/blocks/**`**，其余目录不受 eslint 管（仓根 `eslint.config.mjs` 挂载 preset，biome 保持全仓其余职责）。四规则：

| 规则 | 内容 | fix |
|---|---|---|
| `no-jsx-in-pages` | pages 配置域禁 JSX（§3.3 0 JSX 配置；`.ts` 内 JSX 会被 TS 解析先行拦截）；豁免 = 文件头 `// sandbox:` 登记注释 | — |
| `no-raw-primitives` | 禁裸 `<table>` 家族与 `<dialog>`——必须走 data-table / dialog 系 block（三态 + a11y 内建）；封装本体（data-table 目录）在仓根 config 关规则；逐处豁免 = 行尾 `/* patterns-ui-allow-raw */` | — |
| `no-hex-arbitrary-tailwind` | 禁 hex 色值与 arbitrary 值（`-[…]` utility 位；variant 位 `data-[state=open]:` 不违规）——走主题令牌/设计标度 | spacing 族 px 有确定性等价（`p-[8px]` → `p-2`）；白名单 `allow` 选项（仓根 config 基线）+ 行尾 `/* patterns-ui-allow-color */` |
| `registry-frozen` | 见 §7.1 | — |

**运行命令**（CI / root script `lint:eslint` 接此）：`pnpm --filter @patterns-ui/eslint-plugin lint:eslint`。

### 7.3 archetype slot 一致性校验

三方一致：registry meta（`archetype` 声明）↔ `core/vocab` `BLOCKS_BY_ARCHETYPE`（镜像，由 `vocab:generate` 产出）↔ `core/page` `PAGE_SLOT_FILLS` + `SLOT_NAMES_BY_ARCHETYPE`（A2 手写域表）。校验含：meta 值合法（name=目录名、archetype ∈ 7 值）、宿主表双向镜像、填充表无悬空名、三表原型键全覆盖、词表新鲜度（BLOCK_NAMES ↔ meta 名集）。失败输出列全表（报错即目录）。

**运行命令**：`pnpm --filter @patterns-ui/eslint-plugin check:slots`（进 CI）。
