---

name: ui-page
description: 建/改 @patterns-ui 页面的总入口（五步：分类 → 抄精选组合 → 写配置 → 自检 → 交付）。任何页面工作先加载本 skill；词表真缺转 ui-block，品牌定制转 ui-theme。
---

# ui-page —— 建/改页面总入口

任何页面工作（建页、改页、选组件、加字段）从本 skill 进。铁律（AGENTS.md）：页面 = 配置不写 JSX。

事实层目录是 `docs/patterns.md`（生成物，勿手编——改源后 `pnpm docs:generate`）。本 skill 只写流程与纪律，
**正文永不罗列 block/cell 名字**——词表以 patterns.md 与 typecheck 报错信息为单源（写错名字，报错列出全部合法值）。

## 五步

### 1. 分类：对号入座，不做开放检索

1. 打开 `docs/patterns.md` §1 原型判定表 + §2 判别式，把目标页归入七原型之一（判定表与判别式以该文件为单源，此处不复制）。
2. 判定前先过三层决策树：命中已冻结业务模式 → 用该模式的预设宿主（def + client 适配器一行装配）；
   未命中 → 元模式组合 + 原型分类写配置（行为引用元模式，UI 走原型宿主，仍受词表约束）；词表仍不够 → 转 `ui-block` skill（sandbox 棘轮）。
3. 记录结论：原型、宿主、用到的元模式决策（分页协议、并发语义、批量语义、删除语义等——写进 def，理由进交付摘要）。

### 2. 抄精选组合

- 打开 `docs/patterns.md` §4「每原型精选组合」（取材 demo 18 页真实组合），选最接近的一条，打开它标注的取材文件
  （`apps/demo/src/pages/*.page.ts`）照抄结构。
- 组合里的每个名字都是词表内合法值；本页差异用「换字段 / 增删列 / 换预设宿主 / 调 def 配置」表达，不新造组件。

### 3. 写配置：pages/*.page.ts，纯配置 0 JSX

- 页面 = `apps/demo/src/pages/<name>.page.ts` 纯配置（defineResource / definePage / defineFlow / 视图工厂 spec 的产物
  - 类型化适配器引用）+ `src/routes/` 薄路由胶水（路由文件是胶水不是「页面」）。
- 字段 → 组件走默认映射；override 只能写词表内的名字——拼错由 typecheck 报错列出全表（报错信息即目录）。
- 每页必须接横切三态（loading / empty / error）：由共享四态容器承担，`pnpm ui:check` 校验；三态构造方式见第 5 步。
- 四禁（违反 = lint / typecheck / CI 红）：
  1. 禁 JSX（配置文件里零组件元素、零 JSX 闭包）；
  2. 禁裸原语（原生 table / dialog 家族——横切三态与 a11y 内建在词表件里，逐处例外须行尾登记注释）；
  3. 禁色值（hex、arbitrary tailwind 值）——只走 theme token 语义类；
  4. 禁无类型闭包换「零 JSX」——伪达标；正解是类型化适配器引用（依赖注入返回纯函数，demo 现有登录提交适配器是范例形态）。
- 新宿主 / 新原型：在 `apps/demo/src/pages/tables.ts` 的按原型注入子表登记（`definePage` 类型收窄保证编译期合法值域
  与运行时注入同域；禁止无类型收窄的全量注入）。

### 4. 自检

```
pnpm typecheck && pnpm ui:check --fast
```

- typecheck：词表名字、适配器形状、配置类型。
- `ui:check --fast`：一条龙静态快跑（biome + 范式 eslint 四规则 + 产物新鲜度 + 三方一致核对 + 分数棘轮）；
  交付前再跑一次全量 `pnpm ui:check`（含截图基线 / a11y / chunk 预算）。

### 5. 交付

- 规格摘要：原型 + 宿主 + def 要点（分页协议 / 过滤器 / 行动作 / 批量动作）+ 引用的适配器清单 + 元模式决策及理由。
- 三态截图说明：新页 loading / empty / error 三态各一张截图 + 构造方式——
  loading = 路由拦截延迟；empty = 空过滤（列表类 `?q=zzz-no-match`，表单类 pristine 初始态）；
  error = `?demo-error=<resource>:<status>` chaos 开关（任意 4xx/5xx，支持定向资源）。构造惯例参照 `apps/demo/e2e/states-baseline.spec.ts`。
- e2e：新页主链路至少一条交互链（非截图壳）；涉表单补 422 字段回填断言、涉编辑补 409 冲突断言、涉批量补部分失败汇总断言
  （写法参照 `apps/demo/e2e/form-422-loopback.spec.ts` / `conflict-409.spec.ts` / `bulk-partial-failure.spec.ts`）。

## 反模式

- **「这页很特殊」**：99% 不特殊——先看 audit / team 特例，两者已冻结为模式预设，正是「特殊页」的正解形态；
  判定表覆盖不了的才走 sandbox（`ui-block`）。
- 手工组装 / 写 JSX：页面回流为代码堆叠，「对号入座」退化回「开放检索」，AI 与人失去同一契约。
- 配置塞无类型闭包：配置可读性（人审得懂）是人工验收标准，闭包是伪达标。
- 全量注入词表：包体积上限 = 词表全集，且与运行时注入子集打架；按原型注入子表是唯一形态。
- 绕过词表私造轮子：转 `ui-block`；未登记的组件进不了配置（三方一致核对会红）。
- 品牌定制改组件样式：转 `ui-theme`，只动 theme token。

## 相邻 skill

- 词表真缺组件：`ui-block`（sandbox 棘轮：查重 → 登记 → 晋升）。
- 品牌定制 / 主题 preset：`ui-theme`（只动 registry/themes/*.css token）。

<!-- 三宿主目录同步：本文件在 .zcode/skills/、.claude/skills/、.agents/skills/ 逐字节一致；
     单源 = .zcode/skills/，改动后同步另两份并 diff 核对（同步命令见 docs/agent-acceptance.md）。 -->
