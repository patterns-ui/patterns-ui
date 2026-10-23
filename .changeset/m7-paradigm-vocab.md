---
"@patterns-ui/core": minor
---

M7 范式落地：封闭词表 + 页面/流程编译器 + 五个新子路径。

- 新增 `./vocab`：封闭词表单源 `ARCHETYPES` / `CELL_NAMES` / `BLOCK_NAMES` / `BLOCKS_BY_ARCHETYPE` / `BlockNameFor` / `THEME_PRESET_NAMES` / `CELL_DOCS` / `BLOCK_DOCS`——写错词表名时 TS 报错直接展开全部合法值（报错即目录）。
- 新增 `./page`：`definePage` 七原型 slot 收窄、`PAGE_BLOCKS_BY_ARCHETYPE` / `PageBlockNameFor` 索引访问派生、`resolveBlock` / `planPage` / `PageRenderer`、`defineFlow` headless 状态机 + `ACTION_NAMES`（10 动作词表）、分页协议升格 `def.list.pagination.mode ∈ {page, offset, keyset}` + `paginationCapabilitiesOf`。
- `./data`：`parseError` 单源（四协议，422 必回填）。
- 新增 `./meta`：`META_PATTERN_NAMES` / `defineMetaPattern` / `validateMetaPatternAdapter`（元模式契约 v1）。
- 新增 `./audit`：`useAuditTrail`（audit-trail 契约 v1，keyset 钉死）。
- 新增 `./read`：`useReadState` / `useUnreadCount`（read-state 契约 v1）。
