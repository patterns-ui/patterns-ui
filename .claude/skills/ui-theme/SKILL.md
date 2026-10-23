---

name: ui-theme
description: 品牌定制唯一入口：preset 选择（THEME_PRESET 词表）→ 只改 registry/themes/*.css 的 theme token。逐组件调色 / hex 色值 / arbitrary tailwind 是反模式（eslint 拦截）。
---

# ui-theme —— 品牌定制唯一入口

品牌 = 主题 preset，不是逐组件改样式。全库组件只消费 theme token 语义类
（`bg-background` / `text-muted-foreground` / `--status-*` 家族等），改 token 全组件自动跟随——
这是「一致性的来源是共享内核而非视觉模仿」在样式轴上的落点。

## 流程

### 1. preset 选择

- 合法 preset 名 = THEME_PRESET 词表（封闭、只追加不改名）；当前清单与说明见 `docs/patterns.md` §3.3。
- 代码 / 配置里写 preset 名（如 preset 切换下拉的注入列表）；写错名字 typecheck 报错列出全部合法值（报错信息即目录）。
- 运行时切换走 core 主题 hook：明暗（light / dark / system）与 preset 是双轴，互不干扰；
  切 preset 不清数据缓存（与租户切换语义不同）。

### 2. 改 preset：只动 theme token

- 唯一改动面：`registry/themes/*.css` 的 token 段（`:root` / dark 变量 + `@theme inline` 映射段）。
  状态色一律 `--status-*` 家族（语义 tone：success / warning / danger / info / neutral），品牌主色改 `--primary` 即全库跟随。
- 改完再生成产物：`pnpm build`（含 theme 产物重建）；产物新鲜度由 `pnpm ui:check` 第 5 步校验（改源不改产物 = 红）。

### 3. 新增 preset

1. 复制最接近的现有 preset CSS 为 `registry/themes/<preset>.css`，改 token 集（明暗两段都要改全）。
2. 词表登记：preset 名进 THEME_PRESET（core 侧源）——只追加，不改名。
3. 三产物同步再生成：`pnpm vocab:generate && pnpm docs:generate && pnpm build`。
4. 验证：preset 切换后三处 spot check（页面底色 / 主色按钮 / 状态徽章），跑全量 `pnpm ui:check`（截图基线含明暗两态）。

## 反模式（eslint 拦截 + 人工评审）

- **逐组件调色**：任何「就这一个组件换个色」都是欠债——正解是加 / 改 token，或经组件预留的语义 props。
- **hex 色值 / arbitrary tailwind 值**（如 `bg-[#ff0000]`）：eslint no-hex-arbitrary-tailwind 规则拦截（支持 `--fix`）；
  色值脱离令牌则品牌定制无从下手、明暗态断裂。
- 在组件里硬编码明暗假设：preset 兼容性要求样式只写 token 语义类（依赖 dark: 变体的语义类除外，仍须走令牌）。
- 改 preset 名 / 改 token 变量名：词表与下游引用只追加不改名；换名 = 新增 + 迁移，不是改。

## 相邻 skill

- 页面工作总入口：`ui-page`。
- 词表真缺组件：`ui-block`（主题不解决「缺件」，只解决「配色」）。

<!-- 三宿主目录同步：本文件在 .zcode/skills/、.claude/skills/、.agents/skills/ 逐字节一致；
     单源 = .zcode/skills/，改动后同步另两份并 diff 核对（同步命令见 docs/agent-acceptance.md）。 -->
