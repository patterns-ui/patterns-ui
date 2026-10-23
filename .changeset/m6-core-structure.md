---
"@patterns-ui/core": minor
---

M6 结构收口：data 唯一出口 + 统一存储 + 过滤树下沉。

- `./data`：queryKey 工厂公共出口 `listKey` / `detailKey` / `manyKey` 与 `listKeyPrefix` / `detailKeyPrefix`，收敛三处手搓 key；`./mutation` 子路径删除，变更语义并入 `./data`（0.x minor 承载此移除）。
- 新增 `./storage`：`createStorage` 统一 localStorage 访问（信封封装 + zod 校验 + version/migrate），替代散落的多套手写 key。
- `./filters`：过滤树字段级操作 API 下沉（`evaluateLeaf` / `evaluateTree` / `applyFilterTree` / `flattenLeaves` / `removeLeaf` / `andTrees` / `diffFilters` / `minimalTree`）。
- `pageSize` 单源：`DEFAULT_PAGE_SIZE = 20` 唯一默认，`def.list.pageSize` 直灌，消除双源。
- `getId` 编译期约束：资源缺 id 字段在类型层报错，不再兜底 `"[object Object]"`。
