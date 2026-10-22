# npm 组织独立为 @patterns-ui，子包命名方案

npm scope 从 `@fleetly` 迁至与 GitHub org 同名的 `@patterns-ui`：核心包定为 `@patterns-ui/core`（去掉冗余后缀，import 形如 `@patterns-ui/core/data`），后续包按 `@patterns-ui/<职能>` 命名（`@patterns-ui/eslint-plugin`、未来的模式包）；根包 `patterns-ui` 保持私有不发布。changesets `access` 随 MIT 定案（ADR-0007）由 restricted 改为 public——虽然暂不 publish（ADR-0007），配置先对齐意图。

## Consequences

- 本 ADR 取代 ADR-0009 中的包名方案；仓库宿主与 registry namespace 同步统一为 `@patterns-ui`（`shadcn registry add @patterns-ui=gh:patterns-ui/patterns-ui`）。
- `fleetly.dev` 是 demo 应用的虚构邮箱域名，与 npm 组织无关，保留。
