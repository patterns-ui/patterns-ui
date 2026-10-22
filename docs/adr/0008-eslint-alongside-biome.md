# 自定义 lint 规则走 eslint，biome 保留其余职责

封闭词表与禁令需要自定义规则（pages 无 JSX、禁裸原语与色值、registry 冻结），biome 不支持自定义规则。eslint 插件作用域仅 pages / registry 目录，全仓其余 lint 与 format 仍归 biome；插件按 npm 包形态开发，规则不依赖仓内路径，为未来消费端分发预置。

## Consequences

- 双工具链并存是刻意决策：规则不得越界，越界即回归单工具链讨论。
