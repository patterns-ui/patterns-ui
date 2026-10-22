# 名字解析按原型分组注入，不做全量表

运行时 name→component 的注入表按原型分组，`definePage<Archetype>` 做类型级收窄，使 typecheck 的合法值域与注入表同域（写了未注入的名字直接编译报错），同时包体积不与词表总量绑定。

## Considered Options

- 全量注入表——被否：包体积上限 = 词表全集，且类型域与运行时域互相打架。
- 构建期把配置编译为直接 import 的 vite 插件——备选：词表超过 150 条或 chunk 超预算时重议。
