# 启用 npm publish

ADR-0007 的「暂不 publish」条款解除（2026-10-23 用户拍板）：`@patterns-ui/core` 发布到 npm（`access: public`，MIT）。分发策略升级为双通道——**逻辑层走 npm**（semver + changesets CHANGELOG），**UI blocks 仍走 repo-as-registry**（`shadcn add` 直连仓库，保持「复制进项目、完全自有」的交付形态），与 README「Distribution」承诺对齐。

## Consequences

- 发布链路：版本提交进 main → Release workflow 自动 `changeset tag` 推 tag + `changeset publish` 发 npm（`NPM_TOKEN` 仓库 secret 门控；未配 secret 时保持 tag-only，不失败）。
- 首发版本 = 现行 `0.2.1`（0.1.0/0.2.0 不补发，npm 上首版即 0.2.1；registry.json 内 `@patterns-ui/core@^x.y.z` pin 语义不变）。
- publint / attw CI 关卡（ADR-0007 期间已就位）从「随时可发」变为发布前实闸。
- npm 组织 `patterns-ui` 需在 npmjs.com 存在（公共包免费）；publish 凭证走 granular token（Read & publish），不入 git。
