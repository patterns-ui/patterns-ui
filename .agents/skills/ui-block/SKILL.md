---

name: ui-block
description: 词表真缺组件的唯一合法路径：查重 → sandbox 落位 + 水印 + 登记 → proposed 清单 → registry:freeze 冻结豁免 → 晋升（ui:promote 未来位）。禁止私造轮子绕过词表。
---

# ui-block —— 真缺组件的唯一合法路径

词表查无可用件时走 sandbox 棘轮（paradigm §3.5）：**登记 + 水印 + 查重 + 晋升**。
沙盒是观察区不是垃圾场——复用 ≥2 处即评估晋升，sandbox 使用率是健康指标（持续偏高 = 词表欠债）。

本 skill **正文永不罗列词表名字**——词表以 `docs/patterns.md` §3 与 typecheck 报错信息为单源。

## 流程

### 1. 查重（查三处，仍缺才造）

1. `docs/patterns.md` §3 词表目录（blocks / cells / action / 分页协议 / 主题 preset）——**按语义找，不只按名字找**
   （时间显示、状态、进度、外键、标签等已有覆盖面，看说明列再下结论）。
2. `docs/blocks.md` 规格表——关键 props 与依赖比词表目录更细，很多「缺」其实是现有件的 props 没用上。
3. `registry/blocks/sandbox/` 已登记沙盒件——别人可能已造过同形态。

「缺」的 90% 是没查到。把查重结论（查了什么、为何不满足）记下来——第 4 步豁免要引用。

### 2. sandbox 落位 + 水印

- 目录：`registry/blocks/sandbox/<name>/`（kebab-case，一个 block 一个目录）——`<name>.tsx` + `<name>.meta.json`。
- 文件头登记：`// sandbox: <name> —— <一句话用途>`；pages 配置引用沙盒名同样走文件头 `// sandbox:` 登记或登记表键
  （`pnpm check:names` 消费该标记，未登记即红）。
- 开发态水印：沙盒件在 dev 下渲染角标徽标（如「SANDBOX」），提醒这是未晋升件；水印只在开发态出现。
- 约束与正式件相同：样式只走 token 语义类（禁 hex / arbitrary tailwind）、数据请求一律 core hooks、
  时间 / 状态色 / 路由走对应单源（见 docs/blocks.md 通用约定与「与 core 的边界」）。

### 3. 登记 proposed 清单

`registry/blocks/sandbox/PROPOSED.md` 追加一行：`| <name> | 首用页面 | 日期 | 复用处（追加） | 查重结论 |`。
此后每新增一处复用追加一格；**复用 ≥2 处 → 进入晋升评估**（第 5 步）。

### 4. 冻结豁免

新增 / 移动 registry item 改变冻结清单，须再生成：

```
pnpm registry:freeze
```

再生成 `registry/.freeze.json` 即豁免动作——提交说明必须附理由（引用第 1 步查重结论：词表查无、现有件 props 不满足）。
冻结语义：路径 / name / targetDir 三不变、内容可变；**改名 / 移动即 breaking，一律禁止**。

### 5. 晋升（ui:promote —— 未来位，占位说明）

`pnpm ui:promote` 脚本尚未实现。晋升纪律先记死，届时脚本只是自动化它们：
- **只换 category 不改名**（消费端依赖不断链；词表「只追加不改名」同受约束）；
- 晋升前必须完成相似度查重并把结论记录进 PROPOSED.md；
- 脚本落地前，晋升 = 手工把目录从 `blocks/sandbox/` 移到正式类别 + 重跑
  `pnpm vocab:generate && pnpm docs:generate && pnpm registry:freeze`（词表 / patterns / 冻结三产物同步再生成）+ 跑全量 `pnpm ui:check`。

## 反模式

- 私造轮子：在页面 / 路由胶水里内联组件绕过 sandbox——eslint 登记制 + `pnpm check:names` 会红。
- 未查重直接开造：绝大多数「缺」已被词表或现有沙盒覆盖。
- 沙盒件外发：带水印件进入消费者交付 = 破坏一致性承诺；先晋升再外发。
- 改名晋升 / 移动路径：换 category 是唯一允许的移动。
- 「先正式后补登」：顺序不可倒——正式位进了冻结清单，回头挪动就是 breaking。

## 相邻 skill

- 页面工作总入口：`ui-page`（先分类再判定是否真缺）。
- 品牌定制 / 主题 preset：`ui-theme`。

<!-- 三宿主目录同步：本文件在 .zcode/skills/、.claude/skills/、.agents/skills/ 逐字节一致；
     单源 = .zcode/skills/，改动后同步另两份并 diff 核对（同步命令见 docs/agent-acceptance.md）。 -->
