# 更名：@fleetly/ui-components → @fleetly/patterns-ui

v0.1.0 之后定位上移（卖业务模式 + 装配范式 + AI 指导层），旧名只覆盖四象限中的词表实例层。新名把定位宣言写进标识：交付的是 patterns，UI 是载体；保留 "ui" 词根降低自家 console 迁移的心智成本。赶在 npm publish 与 registry 公开之前完成（ADR-0007 的窗口），改动范围：核心包 `@fleetly/patterns-ui-core`、根包名、registry URL（GitHub 仓库同步改名，旧 URL 有重定向但非永久承诺，消费端引用应更新）、六份文档与 GLOSSARY/README。本地目录名不变，不影响 git。

## Considered Options

- foundry（隐喻：模具/铸件/入库）——被否：隐喻需解释，描述性名字对基础库更友好。
- blueprint——被否：与 Palantir `@blueprintjs/core` 在同一领域正面撞车。
- console / playbook——被否：前者与目标产品撞名，后者气质偏运营手册。
