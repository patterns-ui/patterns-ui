# @patterns-ui/core

## 0.2.3

### Patch Changes

- 修复发布物缺失：0.2.2 发出的包只有 LICENSE + package.json（`dist/` 被 gitignore，CI 发布前未构建）。发布闸门现在在 `changeset publish` 前先构建 core，tarball 恢复完整 148 文件（全部子路径导出可用）。0.2.1（依赖协议坏）与 0.2.2（缺 dist）均不可用，已弃用，请用 0.2.3。

## 0.2.2

### Patch Changes

- 修复发布清单：`dependencies.next-themes` 从 pnpm 工作区协议 `catalog:` 改为真实范围 `^0.4.6`。0.2.1 的发布清单带着 `catalog:`（npm publish 不改写该协议），真实 npm 消费者安装即报 `EUNSUPPORTEDPROTOCOL`，无法使用。与 pnpm-workspace.yaml catalog（0.4.6）保持一致，workspace 内解析不变。

## 0.2.1

### Patch Changes

- 2e444f2: 修复 keyset 分页顺序竞态：`server-cursor` / `load-more` 模式下，第 N+1 页 cursor 未落栈前 `nextPage()` / `loadMore()` 不再前进。修复前快速连点下一页会发出缺 cursor 的请求（服务端返回第 1 页数据被当第 N+1 页渲染），且晚到的第 N 页游标因页面状态已先跳而被追加条件永久丢弃（游标栈断链）。client / server-offset 模式行为不变。

## 0.2.0

### Minor Changes

- 57ef6b6: M6 结构收口：data 唯一出口 + 统一存储 + 过滤树下沉。
  
  - `./data`：queryKey 工厂公共出口 `listKey` / `detailKey` / `manyKey` 与 `listKeyPrefix` / `detailKeyPrefix`，收敛三处手搓 key；`./mutation` 子路径删除，变更语义并入 `./data`（0.x minor 承载此移除）。
  - 新增 `./storage`：`createStorage` 统一 localStorage 访问（信封封装 + zod 校验 + version/migrate），替代散落的多套手写 key。
  - `./filters`：过滤树字段级操作 API 下沉（`evaluateLeaf` / `evaluateTree` / `applyFilterTree` / `flattenLeaves` / `removeLeaf` / `andTrees` / `diffFilters` / `minimalTree`）。
  - `pageSize` 单源：`DEFAULT_PAGE_SIZE = 20` 唯一默认，`def.list.pageSize` 直灌，消除双源。
  - `getId` 编译期约束：资源缺 id 字段在类型层报错，不再兜底 `"[object Object]"`。
- 57ef6b6: M7 范式落地：封闭词表 + 页面/流程编译器 + 五个新子路径。
  
  - 新增 `./vocab`：封闭词表单源 `ARCHETYPES` / `CELL_NAMES` / `BLOCK_NAMES` / `BLOCKS_BY_ARCHETYPE` / `BlockNameFor` / `THEME_PRESET_NAMES` / `CELL_DOCS` / `BLOCK_DOCS`——写错词表名时 TS 报错直接展开全部合法值（报错即目录）。
  - 新增 `./page`：`definePage` 七原型 slot 收窄、`PAGE_BLOCKS_BY_ARCHETYPE` / `PageBlockNameFor` 索引访问派生、`resolveBlock` / `planPage` / `PageRenderer`、`defineFlow` headless 状态机 + `ACTION_NAMES`（10 动作词表）、分页协议升格 `def.list.pagination.mode ∈ {page, offset, keyset}` + `paginationCapabilitiesOf`。
  - `./data`：`parseError` 单源（四协议，422 必回填）。
  - 新增 `./meta`：`META_PATTERN_NAMES` / `defineMetaPattern` / `validateMetaPatternAdapter`（元模式契约 v1）。
  - 新增 `./audit`：`useAuditTrail`（audit-trail 契约 v1，keyset 钉死）。
  - 新增 `./read`：`useReadState` / `useUnreadCount`（read-state 契约 v1）。

## 0.1.0

### Minor Changes

- e2c187c: 首个内部可用版（M0–M5）：core 14 模块（data/list/filters/form/reference/mutation/tenant/auth/router/task/inline/datetime/resource/theme）、77 registry blocks（壳/侧栏/列表四件套/表单三宿主/详情/SaaS 模板页）、四分页模式与 URL 事实源、undoable 变更、租户隔离与主题 preset。发版流程见 docs/registry.md §6（`pnpm changeset` → `pnpm version-packages` → tag `v0.1.0`）。
