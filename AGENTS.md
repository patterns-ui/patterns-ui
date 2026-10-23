# @patterns-ui — 页面工作路由

任何页面工作（建/改页面、选组件、品牌定制）先加载 `ui-page` skill（位于 `.zcode/skills/`、`.claude/skills/` 或 `.agents/skills/`，按你的宿主取其一）。

铁律（违反 = typecheck / eslint / CI 红）：
1. 页面 = 配置不写 JSX：块 / cell / 动作只写词表内的名字，写错看 typecheck 报错列出的全表。
2. 词表真缺组件走 sandbox 棘轮（`ui-block` skill）：登记 + 水印 + 查重 + 晋升，不私造轮子。
3. 品牌定制只动 theme token（`ui-theme` skill）：hex 色值 / arbitrary tailwind / 逐组件改样式都是反模式。

事实层目录：docs/patterns.md（原型判定表 / 判别式 / 词表 / 精选组合 / 反模式）——生成物，勿手编（pnpm docs:generate）。
