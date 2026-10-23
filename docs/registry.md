# Registry 构建与发布

## 1. 源与产物

- **源**：`registry/blocks/<category>/<name>/`（tsx 源码 + `<name>.meta.json`）、`registry/themes/<preset>.json` 与 `registry/skills/skills.json`（M7-D skills 通道一 item 定义——SKILL.md 源 = `.zcode/skills/` 单源，渲染脚本 = `registry/skills/render-skills.mjs`，仓内不复制第二份源）。
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

业务模式组装入口 block（如 `audit-log`、`team-page`）额外带可选 `pattern` 字段（M7-C2，paradigm §1.3），位置紧跟 `archetype`：

```json
"pattern": {
  "contractCard": "registry/patterns/audit-log.contract.md",
  "blocks": ["async-state", "audit-log", "…"],
  "metaPatterns": ["audit-trail", "list-browse", "reference-resolution"]
}
```

- `pattern`（可选，M7-C2）：声明该 item 是某业务模式的**组装入口**——组合了哪些 block、基于哪些元模式、契约卡在哪。
  - `contractCard`：契约卡仓内单源文件（仓库根相对路径，`registry/patterns/<name>.contract.md`；`<name>` 即模式名，与业务 block 名不必相同——如 team-page block → team 模式）。两层契约（元模式契约 + 业务契约）+ `contractVersion` + 变更日志都在卡里；**contractVersion 单源在卡**（`- **contractVersion**: <int>` 行，build.ts 与 docs 生成器同款解析）。
  - `blocks`：该模式组合的 block 名（构建校验 ⊆ 全部 block 名且**含组装入口自身**；模式目录表单源发射进 patterns.md §3.6）。
  - `metaPatterns`：基于的元模式名（封闭词表 16 值，`packages/core/src/meta` 的 `META_PATTERN_NAMES` 与 build.ts 的 `META_PATTERNS` 同源硬编码两处；元模式命名与业务模式不得同名，paradigm §1.2）。
  - 构建（`registry:build`）校验三字段并把契约卡以 **file 形态并入 item files**（`type: "registry:file"`，target = `<targetDir>/<name>.contract.md`）——消费端 `shadcn add <组装入口>` 时契约卡随 files 通道**落盘**到 block 目录旁。
- **CLI 剥离坑（已实测核实，paradigm §1.3/M7-C2）**：顶层 `pattern` 字段经 shadcn CLI 的 registry-item zod parse 会被**静默剥离**——`registry validate` 通过 ≠ 该字段透传给消费端。因此**仓内工具（docs 生成器、决策树等）一律读源 meta.json，不读 dist 产物**；契约卡本体走 files 通道分发，不受剥离影响。`archetype` 字段同理是「validate 不拒但消费端不可见」的仓内附加字段。
- `dependencies`：npm 依赖（带 semver）。`@patterns-ui/core` 版本读 `packages/core/package.json` 自动填充；源码 import 的裸 npm 包（如 `@tanstack/react-query`）自动并入——只有 react 系（react/react-dom/react/jsx-runtime、`react/*`）视为宿主自带不声明。
- `archetype`（可选）：页面原型归属，合法值 7 个（`resource-list` / `resource-detail` / `resource-form` / `settings` / `overview` / `auth-flow` / `wizard`，paradigm.md §3.2）。语义 = 该 block 是哪个原型的**宿主/预设**（如 list-page → resource-list、form-dialog/form-sheet/form-page → resource-form）；仅原型宿主/预设声明，其余 block 不写。构建校验非法值失败；`vocab:generate` 据此产 `BLOCKS_BY_ARCHETYPE`；M7-B1 消费做同原型 slot 结构一致性校验。
- `registryDependencies` 的三种写法与构建期改写（**产物中永不出现裸名**——裸名永远解析到官方 shadcn）：
  - 裸名命中我方 block 名 → 改写为 GitHub 完整引用 `patterns-ui/patterns-ui/<name>`（§4 主通道）；
  - 其余裸名（button/table/dropdown-menu…官方件）→ 改写为 `https://ui.shadcn.com/r/styles/base-nova/<name>.json` 完整 URL（**方言钉扎点** `OFFICIAL_BASE_REGISTRY`，见 build.ts——消费端 components.json 的 style 不再影响我们 item 的方言）；
  - 已含 `/` 的引用（完整 URL / `owner/repo/item` / `@ns/item`）→ 原样保留。
- `targetDir`：安装目标目录（默认 `components/blocks/<category>/<name>`）。
- type 取值：本仓 item 用——组件 `registry:component`、页面模板/模式预设 `registry:block`、主题 `registry:theme`。shadcn registry-item schema 的 type 枚举另含 `registry:item`（组合条目语义，不分发代码）、`registry:file`（任意文件分发）、`registry:lib` / `registry:ui` / `registry:hook` / `registry:page` / `registry:style` / `registry:base` / `registry:font` 等（item 顶层与 files[] 条目同域枚举）——**受 validate 枚举约束，本仓不自定义 type 值**（paradigm §1.3）；契约卡并入 files 时 file 条目 type 用 `registry:file`（消费端得到 .md 落盘，即契约卡分发通道）。

## 3. 构建脚本行为

1. 扫描 `registry/blocks/**/**.meta.json` + `registry/themes/*.json`。
2. 每个 block：读目录内全部 `.tsx/.ts/.css` 文件 → `files: [{ path, target: "<targetDir>/<file>", type, content }]`。
3. 解析源码 import：
   - `@/components/blocks/<name>` → registryDependencies（改写为 `patterns-ui/patterns-ui/<name>` 完整引用）。
   - `@/components/ui/<name>` → 钉扎为官方 base-nova 完整 URL 并入 registryDependencies（ui 别名永远指官方，即使存在同名我方 block）；barrel import `@/components/ui`（无具体名）构建直接 fail。
   - `@patterns-ui/core` → npm dependencies。
   - `@/lib/*`、`@/hooks/*` → 保留原样（用户项目别名解析）。
4. 校验：所有 registryDependencies 引用的 block 存在；无循环依赖（有则报错）；blocks 不得 import demo 代码；`meta.archetype`（可选）∈ 7 原型，非法值构建失败，合法值透传到 registry item 顶层（schema 顶层 additionalProperties 开放，validate 不拒）；`meta.pattern`（可选，M7-C2）三字段校验——blocks ⊆ 全部 block 名且含组装入口自身、metaPatterns ∈ 元模式封闭词表（与 core/meta `META_PATTERN_NAMES` 同源）、contractCard 文件存在且含 contractVersion 行——契约卡以 file 形态（`registry:file`）并入 item files，pattern 连同解析出的 contractVersion 透传到 item 顶层（CLI 消费端会剥离顶层 pattern，见 §2 剥离坑）。
5. 主题：生成 `registry:theme` item（**仅 css 文件，不带 cssVars 字段**）。每个 preset css 文件自含 `@theme inline` 段（全部令牌 → `--color-*` 一对一映射 + radius 派生四档，口径与 apps/demo/src/styles.css 一致）——消费端只 add 一个 theme item、`@import` 落盘 css 即可用全部语义色/radius utility。不带 cssVars 的原因：CLI 对 registry:theme 的 cssVars 物化会向消费端 index.css 追加自生成的 `@theme inline`，其 var 引用双写前导横线（`var(----x)`，shadcn@4.21/4.22 实测，官方标准 token 一并损坏），且 `:root`/`.dark` 平铺物化与我们的 `data-preset` 多 preset 切换语义冲突——theme 的唯一交付面是自含 css 文件。
6. 输出 `registry.json` + `dist/r/*.json`；CI 以 `git diff --exit-code` 校验产物新鲜度（词表生成物同入校验，见下），`pnpm dlx shadcn@latest registry validate` 校验 schema；`registry-consumer` job 跑消费端冒烟（`pnpm registry:smoke`）。
7. **词表生成器**（`registry/scripts/generate-blocks.ts`，`pnpm vocab:generate`）：读全部 meta.json + themes/*.json，产出 `packages/core/src/vocab/blocks.generated.ts`（`ARCHETYPES`/`CELL_NAMES`/`BLOCK_NAMES`/`BLOCKS_BY_ARCHETYPE`/`THEME_PRESET_NAMES` 及派生类型与 `*_DOCS`，形态见 paradigm.md §3.3 (2)）。确定性：名字码位排序、格式经 biome canonicalize，连跑两次零 diff。**生成物提交进 git**；根 `build` 先 `vocab:generate` 再构建 core（词表先于 core 构建）；CI 在 build 后重跑并纳入 freshness diff（改 meta 不重新生成 = 红）；core 侧 `blocks.test.ts` 另有单源与新鲜度单测兜底。pattern 不是 block（不进词表）；文档生成器（§8）读源 meta.pattern 发射业务模式目录。
8. **文档生成器**（`registry/scripts/generate-docs.ts`，`pnpm docs:generate`，M7-C1；M7-C2 扩）：AGENTS.md + CLAUDE.md symlink + `docs/patterns.md`——其中 §3.6 业务模式目录单源读**源 meta.json 的 pattern 字段 + registry/patterns/*.contract.md**（目录表 × contractVersion × 契约卡摘要[首行 + 内置决策要点]；不读 dist——CLI 剥离坑，见 §2）；交叉校验 blocks ⊆ BLOCK_NAMES、metaPatterns ⊆ META_PATTERN_NAMES（core/meta 同源词表）。

## 4. 发布通道

- **主通道：GitHub repo-as-registry**（私有仓库，走 gh auth / GH_TOKEN）：
  ```bash
  npx shadcn add patterns-ui/patterns-ui/data-table
  ```
  版本 pin：`npx shadcn add patterns-ui/patterns-ui/data-table@0.3.0`（registryDependencies 内自引用 `name@semver`）。
- **skills 双通道（M7-D，paradigm §4.3；用法全文见 README「AI / skills」节）**：
  - **通道一 `skills` item（`registry:file`，按项目渲染）**：`npx shadcn add patterns-ui/patterns-ui/skills` → 三份 SKILL.md（源 `.zcode/skills/` 单源）+ 内嵌渲染脚本落 `<project>/.patterns-ui/skills/`（target `~/` 前缀 = **项目根**，官方 registry 文档 "Use ~ to refer to the root of the project"）→ 消费端手动 `node .patterns-ui/skills/render-skills.mjs` 按项目形态渲染到 `.claude/.zcode/.agents` 三宿主 skills 目录（`--host` 选宿主、`--pages-dir`/`--pm` 微调正文——「按消费项目生成变体」的最小自实现）。item 无 registryDependencies/dependencies（引用自家一律完整 URL 的禁裸名约束 vacuous 满足）；add + 渲染链路进 CI 冒烟（`pnpm registry:smoke`）。
  - **通道二 skills.sh 静态源（生态主渠道）**：`npx skills add patterns-ui/patterns-ui`——skills CLI 标准扫描目录已含 `.claude/skills/` 与 `.agents/skills/`，仓内三目录单一源结构原生兼容，无需额外布局；静态源不随项目形态调整，需要变体走通道一。
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
- **npm 分发（ADR-0011）**：`@patterns-ui/core` 发布到 npm（首发 `0.2.1`；0.1.0/0.2.0 是 tag-only 时代版本不补发）。链路：changeset 进 main → Version Packages 落定进 main → Release workflow 自动 `changeset tag` 推 tag + `changeset publish` 发 npm——后者由仓库 secret `NPM_TOKEN`（granular token，Read & publish）门控，未配置时保持 tag-only。手动补发：`npm login` 后 `pnpm build && cd packages/core && npm publish`。
- 发布前置自检：版本提交前必须 `pnpm registry:build` 刷新 registry.json 的 `core@^版本` pin（CI freshness 会抓）；publint / attw 是发布前实闸。

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

**发布状态（M7-D，定案 4）**：插件 `private: true`、仅本仓 CI 使用，**暂不 npm 发布**——推迟至有真实外部消费者反馈后（B1 的「规则不依赖仓内路径」约束即为届时发布预置）。

### 7.3 archetype slot 一致性校验

三方一致：registry meta（`archetype` 声明）↔ `core/vocab` `BLOCKS_BY_ARCHETYPE`（镜像，由 `vocab:generate` 产出）↔ `core/page` `PAGE_SLOT_FILLS` + `SLOT_NAMES_BY_ARCHETYPE`（A2 手写域表）。校验含：meta 值合法（name=目录名、archetype ∈ 7 值）、宿主表双向镜像、填充表无悬空名、三表原型键全覆盖、词表新鲜度（BLOCK_NAMES ↔ meta 名集）。失败输出列全表（报错即目录）。

**运行命令**：`pnpm --filter @patterns-ui/eslint-plugin check:slots`（进 CI）。
