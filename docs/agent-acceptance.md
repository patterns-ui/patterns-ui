# Agent 验收附件（M7-C3）

> 标准化「任一新 agent 会话按标准任务产出可判定 PR」的验收流程。两层口径（paradigm §6-C3）：
> **自动层全命令判定**（eslint 全规则 + 三方核对 + sandbox 零新增 + 三态截图），
> **人工层只判配置可读性**（§3.4：一份契约两种渲染同一来源；配置里塞无类型闭包换「零 JSX」是伪达标，禁止）。

## 1. 标准任务提示词模板（梯度三档）

使用方式：开一个**不喂任何本仓上下文**的新 agent 会话，原样下发模板（可替换 `<资源>` 占位）。
会话应自行经根 AGENTS.md 路由到 `ui-page` skill 完成工作——AGENTS.md 是否被正确消费本身就是被测项。

### L1 只读列表（入门）

```
在 demo 新增 <资源> 页：只读列表。
要求：def 配置化（分页 page 协议、≥2 个过滤器、状态列、时间列）+ 路由胶水 + mock handler
（种子 ≥30 行、状态有分布）+ e2e 一条（加载 / 过滤进 URL / 翻页）。
```

### L2 全 CRUD（标准）

```
在 demo 新增 <资源> 页：def + 列表/详情/表单配置化 + mock + e2e。
表单含 422 字段回填闭环一条（服务端独有规则触发 → 字段级回填 → 改正再提交成功）；
编辑含 409 冲突一条（If-Match 版本语义：他人先保存 → 本页提交冲突 → 刷新后可保存）；
批量操作含部分失败汇总一条（成功 N 失败 M）。
交付三态截图说明 + 规格摘要。
```

### L3 模式与品牌（进阶，三选一）

```
A. settings 页挂一个扩展节（sections[] 声明式挂载，不写 JSX）。
B. 新增品牌 preset：token 全集（明暗两段）+ THEME_PRESET 词表登记 + 三产物再生成。
C. 词表真缺一件 → sandbox 全流程（查重结论 + 落位 + 水印 + PROPOSED 登记 + registry:freeze 豁免）。
```

判定口径：L1 / L2 期望 **sandbox 零新增**；L3-C 允许 1 件新增（登记必须齐全）；L3-B 允许 themes 词表追加（只追加不改名）。

## 2. 环境

pnpm monorepo（`@patterns-ui`）。mock API 内置于 dev server（无需外部服务）；e2e 确定性三件套
（冻结时钟 / 禁动画 / 每 worker 重置）见 `apps/demo/e2e/states-baseline.spec.ts` 的 `prepare()` 惯例。

| 用途 | 命令 |
| --- | --- |
| 安装 | `pnpm install` |
| dev server（4173，mock 内置） | `pnpm dev` |
| 类型检查 | `pnpm typecheck` |
| lint（biome 全仓） | `pnpm lint` |
| 范式 lint（eslint 四规则） | `pnpm lint:eslint` |
| 配置名字三方核对 | `pnpm check:names` |
| archetype/slot 校验 | `pnpm slots:check` |
| 一条龙质量门 / 静态快跑 | `pnpm ui:check` / `pnpm ui:check --fast` |
| 截图基线（更新用 --update-snapshots） | `pnpm ui:shots` |
| 一致性分数棘轮 | `pnpm ui:score --check` |
| 单元测试 | `pnpm test` |
| e2e（dev 套件，apps/demo） | `pnpm test:e2e` |

**skills 加载方式**：根 `AGENTS.md`（Claude Code 宿主经 `CLAUDE.md` symlink 同文）指向
`ui-page` / `ui-block` / `ui-theme` 三个 skill；三宿主目录 `.zcode/skills/`、`.claude/skills/`、`.agents/skills/`
内容**逐字节一致**，按宿主取其一。skill 正文永不罗列词表名字——词表单源在 `docs/patterns.md` 与 typecheck 报错。

**mock chaos**：页面 URL 带 `?demo-error=<code>`（`<status>` 全局或 `<resource>:<status>` 定向，任意 400–599）
即可让对应端点返回错误——构造三态与错误链路无需改代码；字段级 422 由 handler 内置业务规则产生（两机制正交）。

## 3. 判定清单

### 自动层（命令判定，任一红即不通过）

- [ ] **eslint 全规则绿**：`pnpm lint:eslint`（pages 0 JSX / 禁裸原语 / 禁 hex 与 arbitrary tailwind / registry 冻结）
- [ ] **三方一致核对绿**：`pnpm check:names`（配置名字 ⊆ 注入表 ∪ sandbox 登记表）
- [ ] **sandbox 零新增**：`git status registry/blocks/sandbox/` 无变化（L3-C 除外——须文件头 `// sandbox:` 登记
      + PROPOSED.md 行 + `pnpm registry:freeze` 再生成，缺一即红）
- [ ] **三态截图**：新页 loading / empty / error 三态截图 + 构造方式说明（loading = 路由拦截延迟；
      empty = 空过滤 / pristine；error = `?demo-error=` chaos 开关）
- [ ] 基础门：`pnpm typecheck` / `pnpm lint` / `pnpm test` 绿；`pnpm ui:check --fast` 绿
- [ ] 存量回归：`pnpm test:e2e`（dev 套件，含 422 回填 / 409 并发 / bulk 部分失败三 spec）+ `pnpm ui:shots --check`
      + `pnpm ui:score --check` 不回退

### 人工层（只判配置可读性——paradigm §3.4 / §6-C3 口径）

- 配置可读：人能从 `apps/demo/src/pages/*.page.ts` 直接读出页面结构（原型 / 宿主 / 字段 / 列 / 动作 / 三态），
  不需要追进渲染出口才能理解这页是什么。
- 无伪达标：配置里没有无类型闭包 / 大坨内联逻辑换「零 JSX」；逻辑接线是类型化适配器引用（依赖注入返回纯函数）。
- 名字可信：全部组件名来自词表（typecheck 报错驱动的修正痕迹可追溯），无手写名字绕过。

## 4. skills 三目录同步（维护者操作）

单源 = `.zcode/skills/`；另两份是同步副本。改动 skill 只改源，然后整目录同步：

```bash
rm -rf .claude/skills .agents/skills
cp -R .zcode/skills .claude/skills && cp -R .zcode/skills .agents/skills
diff -r .zcode/skills .claude/skills && diff -r .zcode/skills .agents/skills  # 必须零输出
```

CI 接线（Freshness 步追加三目录 diff 校验）由主会话在 M7-C3 收口时决定——建议与 AGENTS.md / patterns.md
同口径进 `git diff --exit-code`（见 paradigm §4.3 仓内新鲜度）。
