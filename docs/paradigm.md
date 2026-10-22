# 范式与定位设计（M6–M8 的设计契约）

本文定义 `@patterns-ui` 的产品定位、架构判据、页面构建范式与 AI 指导机制，并据此给出 M6–M8 的任务与验收清单。**与 architecture.md（分层契约）、registry.md（分发契约）、core-api.md（API 契约）同级，本文是 M6–M8 各阶段的验收依据。** 里程碑明细暂记于本文，各阶段验收通过后回写 milestones.md。

> **修订记录**
> - v1（2026-10-22）：初稿。
> - v2（2026-10-22）：经四路独立审查（事实核查 / 设计批判 / 落地可行性 / 外部机制验证）修订。主要变化：修正 6 处事实错误与计数；原型表重构（error/empty 降为横切三态、宿主为 prop、补 tabs/subResource slot、wizard/auth 判别式）；新增名字解析×tree-shaking 决策记录；新增 M7-D 分发型执行层；M7 拆为 A1–D 共 10 个任务并全部验收可测化；M8 改为一交付物一任务；新增 §8 非功能需求；AI Elements 消费对象改为 shadcn 官方（Vercel 版已宣布弃用）；skills 分发降级为双通道表述。
> - v3（2026-10-22）：一致性审查收口。新增 §1.2 元模式层（两层模式、16 项元模式清单、分页适配示例、协议变异轴全景）与 §10 四项定案落实；M7 任务计数修正 10→11；补齐悬空归属（M7-A2 增分页 mode/错误信封出口、M7-B1 增 slot 结构校验、M7-B4/D 增补、M7-C2 增 adapter 校验与 pattern 字段剥离备注、M6-D 增 typed-form-field 绑定、M6-E 增 core-api/architecture/milestones 漂移项）；settings 节化统一归 M7-A2；"第 9 原型"残留修正为第 8；带圈数字专用指四象限。
> - v4（2026-10-23，M7-A3 落地）：页面迁移实数修正与验收命令落形。25 个路由文件（原记 24：`_shell` 豁免项实覆盖 `_shell.tsx` + `_shell/index.tsx` 两文件；`403` 为 ErrorPage 错误小页不属七原型）= 18 页三批配置化（资源 8——原记 9 无第 9 页；模式 6；auth 4）+ 7 文件豁免；验收命令 `grep -L 'return <' apps/demo/src/pages/*.ts` 与「0 JSX 配置」意图相悖（.ts 本就不能含 JSX 且 -L 语义反了），改写为 `grep -rEl '<[A-Z][a-zA-Z]*' apps/demo/src/pages` 为空 + `ls apps/demo/src/pages/*.page.ts | wc -l` = 18；§3.3(1) 目录表述更新为 pages/*.page.ts + 薄路由胶水。

状态：已评审定案（2026-10-22，四项开放问题拍板结果见 §10）。**断言基于 2026-10-22 对源码的逐条复核**（复审方法：四路独立审查对照 `packages/core/src`、`registry/**`、`apps/demo/src`、`.github/workflows`）。

---

## 1. 产品定位：卖业务模式，不卖设计

### 1.1 与普通 UI 组件库（blocks）的区别

| | 普通 blocks 库（如 shadcn blocks） | 本仓库 |
|---|---|---|
| 交付单位 | 视觉素材（长得好看的页面起点） | 业务模式（决策已内置的成套能力） |
| 用户拿到后 | 自己接线、自己配数据、自己想业务规则 | 实现契约适配器（几个后端接口），UI + 逻辑 + 行为即就位 |
| 一致性来源 | 视觉模仿（随用户改代码衰减） | 共享内核强制（数据层/状态哲学/错误模型/撤销模型统一） |
| 一致性的性质 | 表层（长得一样） | 深层（**行为一样**：学一个模式 = 会所有模式） |

### 1.2 两层模式：元模式（headless）与业务模式（特化）

> **业务模式 = 元模式组合 × 业务决策 × UI 预设（preset blocks + 契约卡）。元模式是 headless 行为引擎**——状态机、数据契约、行为语义（分页/撤销/并发/轮询），不渲染任何 UI、不 import 任何组件、不绑定任何业务。

- **分层归属**：元模式坐 ①象限（公共+不变，core 内纯逻辑模块，可脱离渲染测试）；业务模式坐 ②象限（特化+不变，决策冻结 + 版本化 + 契约卡）。一个元模式服务多个业务模式（audit-trail 引擎同时供审计页与未来的 changelog 组件）。
- **行为一致性的结构载体**：跨模式"行为一样"由共享元模式引擎承载（同一 undo 模型、同一游标语义、同一 409 处理），UI 预设只承载外观。
- **契约卡分两层**：元模式契约（通用语义：端点形状、分页、错误语义）+ 业务契约（领域字段与决策）。契约卡含 **`contractVersion` 与变更日志**；core 元模式 hook 在 dev 模式对注入 adapter 做形状校验，版本不匹配即警告（M7-C2）。
- **决策**：审计日志用 keyset 游标而非 offset；邀请可撤销；删除带 undo 窗口；乐观并发走 409 If-Match；高危操作 type-to-confirm——逐条写进契约卡及理由。
- **永不改名纪律**：registry item 名与路径一经发布不得改名（`ui:promote` 只允许换 category 不允许换 name）——"词表只追加不改名"同时约束配置名与 item 名，否则消费端 `registryDependencies` 断链（写入 §2.2 与 registry.md）。

**元模式清单（headless 引擎，业务无关）**：

| 元模式 | 内容 | 现状 |
|---|---|---|
| resource-lifecycle | CRUD / 乐观并发 / 批量 | ✓ core data+mutation |
| list-browse | 过滤代数 / offset·cursor 分页 / 保存视图 | ✓ core list+filters |
| reference-resolution | 外键解析与共享缓存 | ✓ core reference |
| multi-tenant | 租户切换 / 缓存隔离 | ✓ core tenant |
| auth-rbac | 会话快照 / 守卫 / 能力过滤 | ✓ core auth |
| task-polling | 异步任务状态轮询 | ✓ core task |
| new-items-signal | 轮询期新数据探测 | ✓ core task |
| flow | 步骤机 / 转移 / 步骤间数据保留 | M7-A2（defineFlow） |
| audit-trail | append 日志 / keyset / actor·action | 待抽取（现内嵌于 audit-log 业务模式） |
| read-state | 未读计数 / 已读状态 | 待抽取（现散在 notification-inbox 业务模式内） |
| billing-lifecycle | plan / 席位 / 发票状态机 | M8 波1（纯契约先行） |
| api-key-lifecycle | 签发 / 一次性 reveal / scope | M8 波1 |
| import-pipeline | 解析 / 映射 / 校验 / 提交 | M8 波2 |
| comment-thread | 线程树 / @提及 / 已读 | M8 波2 |
| webhook-delivery | 端点 / 事件订阅 / 投递重试 | M8 波3 |
| permission-matrix | 角色×能力求值 | 待建（求值守卫 fail-closed 已有 core auth；矩阵引擎与 UI M8 波3） |

元模式命名规约：**与业务模式名不得同名**，用行为语义后缀（-lifecycle / -pipeline / -delivery / -matrix / -state）。

**示例：分页协议适配（元模式如何吸收服务端差异）**——分页模式是 list-browse 元模式的变异轴：协议集是封闭词表（`mode: "page" | "offset" | "keyset"`，Relay connections / ES search_after / Stripe starting_after 均归一为 keyset），声明处唯一（适配器的 `pagination.mode`，消费端实现），引擎按协议派生 URL schema（page 家族 `?page=&size=`；keyset 家族的 URL 承载是 page 序数或 load-more 深度，**cursor token 留内存不进 URL**——与 core-api §3 现行语义一致）、queryKey 形状、筛选重置语义（page→1 / cursor→null）、总数有无处理；UI（pagination-bar 三形态）由派生能力决定（keyset 无 canJump，禁渲染页码窗口）而非 mode 本身，数据模式与 UI 形态为正交两轴（shape 是偏好）。**行为不变量跨模式统一**：URL 往返还原、保存视图、pageSize 钳制、筛选必重置——换协议不变，因为同一引擎承载。AI 配置只写 mode 一行，拼错由 typecheck 报错列合法值；新增第四协议走 ①象限变更纪律（协议+能力映射+UI 变体+失败路径测试一次补齐），不开 `custom` 口子。协议选择（如审计为何 keyset 而非 offset）记入契约卡业务决策。mode 升格为 def 一等契约节点归 M7-A2（现状：pagination-bar 三形态/audit keyset/load-more URL 已事实存在，缺统一声明出口）。

**泛化：协议变异轴全景。** 适配模式（封闭协议集住元模式 + 唯一声明处在适配器 + 能力派生 + 跨协议行为不变量）适用于满足三条件的变异轴：（a）差异可枚举为有限协议集（协议级，参数级差异留适配器自由实现）；（b）协议蕴含能力/语义差，需引擎或 UI 派生；（c）存在跨协议不变量。纪律：**单一实现不预造协议**（"出现第二种实现"=四象限第二份拷贝触发信号，届时提取）。

| 族 | 变异轴 | 封闭协议集 | 派生与跨协议不变量 | 现状 |
|---|---|---|---|---|
| 传输凭证 | 错误信封 | problem+json / {code,message} / 裸状态码 / 字段错误数组 | 同错误同展示；422 必回填 | 半（HttpError 分档有，解析出口未统一；M7-A2） |
| 传输凭证 | 凭证传递 | Bearer / Cookie 会话 / 刷新令牌流 | 401 → 登出/跳转、快照流转 | 半 |
| 传输凭证 | 租户上下文 | path 段 / 子域 / header | 切换必清缓存 | 已（path 段唯一实现，其余待第二种实现出现） |
| 读取 | 分页 | page / offset / keyset（Relay、search_after 等 keyset 变体归一） | URL 往返还原、保存视图、pageSize 钳制、筛选必重置 | 半（三形态已有，mode 声明出口挂 M7-A2） |
| 读取 | 排序 | -field 前缀 / orderBy+dir / 多列数组 | 排序进 URL、筛选变更重置 | 半（URL 编解码与重置语义已单源 core list；适配器侧排序方言未开放） |
| 读取 | 过滤方言 | FilterTree JSON / 重复参数 / RQL | FilterTree 代数为规范形、URL 往返 | 半（引擎有，序列化方言未开放） |
| 读取 | 搜索 | 服务端全文 / 客户端过滤 / 专用端点 | q 进 URL、防抖统一 | 半 |
| 读取 | 字段展开 | include / GraphQL 嵌套 / 客户端解析 | 同 id 共享解析缓存 | 已（reference-resolution 即此协议） |
| 读取 | 主键形态 | uuid / 数字 / 复合键 | 编译期 getId 约束、租户段拼装 | 未（复审 bug 即此轴渗漏；M6-C 编译期约束） |
| 读取 | 时间格式 | UTC ISO / epoch / 本地裸串 | 时区感知、偏好记忆 | 已（core/datetime） |
| 写入一致 | 乐观并发 | ETag+If-Match / version 字段 / 无 | 409 统一冲突提示+刷新 | 已 |
| 写入一致 | 批量语义 | 逐条 / all-or-nothing / 207 部分失败 | undo 窗口、汇总一致 | 已 |
| 写入一致 | 删除语义 | 硬删 / 软删+恢复 / 归档+TTL | undo 模型统一 | 半（undo 已有；软删/回收站 P2 未排期） |
| 写入一致 | 上传 | multipart / 预签名两步 | pending/失败态统一 | 未（M8 import 随带） |
| 写入一致 | 导出 | 客户端 CSV / 服务端任务+轮询 | 过滤感知 | 半（客户端版已有） |
| 探测治理 | 新鲜度 | 轮询 / 条件 GET / SSE / WS | 新数据不自动插行 | 半（轮询+signal 有） |
| 探测治理 | 权限求值 | 静态角色 / 能力串 / 策略声明 | fail-closed | 已（求值守卫；矩阵引擎待 M8 波3 permission-matrix） |
| 探测治理 | 选项加载 | schema 枚举 / 选项端点 / facet 计数 | 同 id 共享缓存 | 已 |

形式化优先级 = 复审踩过坑的轴优先（错误信封挂 M7-A2、主键挂 M6-C）；M8 各模式任务随带补齐自用轴（上传/导入、导出）；软删/回收站 P2 未排期、待需求牵引。**协议轴即元模式契约卡的章节结构**：list-browse 卡 = 分页/排序/过滤/搜索/选项五节，resource-lifecycle 卡 = 并发/批量/删除/主键四节；业务模式契约卡不重复协议描述，只钉选择及理由——协议文档单源在元模式。

### 1.3 模式目录（实数 13：现有 5 + 规划 6 + 缓行 2）

现有初代模式（已实现，M7-C2 升格为一等概念）：`audit-log`、`team`、`notification`、`settings`、`onboarding`。
规划模式：`billing`、`api-key`、`webhook`、`import`、`permissions`、`integration`。缓行（P2）：`sso`、`alerting`。

每个模式 = core 逻辑复用 + preset blocks + **一页契约卡**（含 contractVersion；后端要实现什么 + 内置了哪些决策及为什么）+ demo 实例。模式是**纵切横层的切片**，registry 以附加字段组织（见 M7-C2，受 shadcn validate 类型枚举约束，不用自定义 type 值）。

---

## 2. 架构准则：双轴四象限

**"公共/特化"与"不变/易变"是两条独立的轴。** 规则：**不变的下沉，易变的上浮；机制下沉，实例上浮。**

| | 不变 / 不易变 | 易变 |
|---|---|---|
| **公共** | ① **core 机制层（含元模式，headless）**：数据语义（缓存/queryKey/租户隔离）、状态哲学（architecture.md §3）、错误模型、undo 模型、FilterTree 代数、页面原型语法、§1.2 元模式清单 | ③ **词表实例层**：cells、form widgets、视图模式（table/grid；kanban/calendar 见 §3.2，M8）、主题 preset、图标映射 |
| **特化** | ② **模式层**：§1.3 目录，决策冻结 + 版本化 + 契约卡 | ④ **应用层**：页面组合、sandbox 组件、产品文案、demo |

### 2.1 判据与信号

- **判别两问**："换一家公司/产品，这个决定还成立吗？"（成立 → 公共）；"下个版本会想改它吗？"（不会 → 不变）。
- **依赖方向（强制）**：只许"易变 → 依赖 → 不变"、"特化 → 依赖 → 公共"。反向即违规（现存案例：core 的 `data` 模块 import `mutation` 模块，模块依赖方向反了，M6-B 修复）。注：此处指 core 包内模块间的依赖方向；architecture.md §2 的 L0–L4 是 UI 分层编号，两套编号不混用。
- **触发信号**：某逻辑出现第二份拷贝 → 该下沉没下沉；某稳定层频繁 breaking → 该上浮没上浮。

### 2.2 变更纪律（按象限）

| 象限 | 变更纪律 | 测试力度 |
|---|---|---|
| ① 机制 | semver，breaking 是事件，须迁移方案 | 最强（契约测试 + 跨模块一致性测试 + **失败路径单测**） |
| ② 模式 | 冻结 + 契约卡 contractVersion 同步；item 名永不改 | 主链路 e2e |
| ③ 词表 | **只追加，不改名**（配置名与 registry item 名同受约束；`ui:vocab-diff` 校验联合类型仅新增） | 快照 + 类型生成校验 |
| ④ 应用 | 完全自由 | 常规 |

### 2.3 v0.1.0 复审债务的象限归因（计数已对源码复核）

- **该下沉没下沉**：6 份 shell/sidebar 变体拷贝（易变"变体"未下沉为 prop）；过滤树字段级递归 ×2（filter-bar、facet-sidebar）；裸 localStorage 读写 ≥7 处（core 5 + blocks 2：data-table 列偏好、cell-time）；手写防抖 ×2；手拼 queryKey ×3（registry 内：team-page、notification-inbox、global-search-page）；pageSize 双源真相。
- **该上浮没上浮**：hook 内硬编码中文文案（④ 的文案焊死在 ② 逻辑里，不可覆写）；zod 私有 API 内省长在 resource 层（易变启发式长在公共契约层，上浮为 dev-only）；typed-form-field label id 未绑控件。

### 2.4 推论

1. **包边界 = 象限边界**：core npm 包 = ①（+③的机制与词表类型）；registry = ②③的 UI 面；demo = ④。
2. **棘轮 = 象限迁移机制**：sandbox（④）组件复用 ≥2 处时经查重晋升 ③/②，**晋升不改名**。
3. 现行 L0–L4（architecture.md §2）是横层，本节双轴是纵轴判据，二者正交。

---

## 3. 页面构建范式：原型 + 封闭词表

### 3.1 三层决策树

```
第一层：业务模式匹配（目录 §1.3，实数 13）→ 命中：def + client 适配器，一行装配
第二层：未命中业务模式 → 元模式组合 + 页面原型分类（§3.2，7 选 1）→ 写配置（行为引用元模式，UI 走原型 Layout——合法且受词表约束）
第三层：词表仍不够 → sandbox 棘轮（水印 + 查重 + 晋升）
```

核心：**把"从库里选组件"（开放检索，LLM 不可靠）改造成"对号入座"（封闭分类，LLM 可靠）**。造轮子的最小单位上移到业务模式粒度；**逃生断层从两步变三步**——无业务模式时先走"元模式 + 原型自组 UI"（如 audit-trail 元模式 + resource-list 原型可搭出任意追踪类页面），仍不够才进 sandbox。

### 3.2 七个页面原型 × 每原型强制三态

**error/empty 不是原型**：loading/empty/error 是所有原型的横切三态，由 async-state 与 error-pages 共享 block 承担，每个 Layout 必须接三态（ui:check 校验）。

| 原型 | 唯一 slot 结构 | 宿主/变体（prop） | 现状 |
|---|---|---|---|
| resource-list | toolbar / filters / view(table·grid·kanban·calendar) / rowActions / empty | list-page；view 为 prop | ✓（kanban/calendar 待 M8） |
| resource-detail | header / tabs(sections·subResource·custom) / timeline / comments | detail-page | ✓（core 已实现 tabs 三 kind；custom 改登记制 M7-A2；comments 待 M8） |
| resource-form | fields / layout / submit | **host: dialog·sheet·page**（现三 block 为宿主预设；远期评估合并为单 block + host prop——M8 波2 peek 落地时顺带） | ✓ |
| settings | sections[]（可扩展，计费/集成挂载点） | settings-page | ✓（节化改造在 M7-A2） |
| overview | statCards / charts / activity | dashboard-page | ✗ M8 波1 补建（现仅 stat-strip） |
| auth-flow | steps 内嵌 / form / success | auth 卡片壳（AuthCardLayout，M6-D 抽取，现四页平行 block） | ✓ |
| wizard | steps[] / transitions / actions | stepper 宿主 | ✓（action 词表 M7-A2 定义） |

**判别式**：步骤含账号语义（登录/验证/找回）→ auth-flow，否则 wizard；auth-flow 允许内嵌 step（OTP 即 step）。**"唯一"约束的是 slot 结构**：同原型的所有宿主/变体共享 slot 签名，registry meta 声明 `archetype` 字段，CI 校验同原型 slot 结构一致（M7-B1）。变体一律是 Layout 的 prop，不是平行 block。

### 3.3 封闭词表的实现（名字间接层）

1. **配置写名字**：页面配置集中在 `apps/demo/src/pages/*.page.ts` 纯配置（0 JSX：defineResource/definePage/defineFlow 产物 + 类型化适配器引用；注入子表单点在 `pages/tables.ts`，按原型分组完整 BlockTable）。路由文件（`src/routes/`）是薄胶水——引用配置 + 运行时渲染出口（视图工厂或 PageRenderer；TanStack Router 仍需 tsx 路由文件，路由胶水不是「页面」）；字段→组件默认映射，override 只能写词表内的名字。
2. **类型查名字**：构建生成 `blocks.generated.ts`——各词表为**显式注解**的字面量联合类型（防 TS2742 跨包推断失败）+ JSDoc；生成物提交进 git（TanStack Router `routeTree.gen.ts` 同模式，IDE/CI 无需先跑生成器）。写错名字 → typecheck 报错列出全部合法值（**报错信息即目录**）。落形态（M7-A1 定案）：各词表生成 `X_NAMES = [...] as const` 元组 + `XName = (typeof X_NAMES)[number]` 派生联合——元组内为显式字面量、无推断歧义（防 TS2742 目的等同达成），而派生联合在报错信息里**展开全部合法值**（别名直写的字面量联合只显示别名与最近候选，TS2820，不满足"报错信息即目录"）；每个名字行上方带 JSDoc 注释 + `X_DOCS: Record<XName, string>` 描述映射常量（单源均为 meta description，供 patterns.md/AGENTS.md 生成器与 ui:check 工具消费）。
3. **运行时解析名字**：core 提供 name → component 解析出口。

> **决策记录：名字解析 × tree-shaking。** 全量注入表会让包体积上限 = 词表全集，且"词表全量合法（typecheck）与注入子集（运行时）"两个世界互相打架。选定方案：**按原型分组的注入子表 + `definePage<Archetype>` 类型级收窄**——类型收窄后，typecheck 的合法值域与注入表同域，写未注入的名字直接编译报错；宿主按需注入原型子表，体积可控。备选（触发条件：词表 >150 条或 chunk 超预算时重议）：构建期把配置编译为直接 import 的 vite 插件。禁止：无类型收窄的全量注入。

### 3.4 一等公民原则（人类与 AI 同权）

> **一份契约，两种渲染，同一来源。** registry 是唯一事实源：向人类渲染为 types + IDE 补全（JSDoc）+ docs/；向 AI 渲染为 AGENTS.md + 类型报错。禁止任何只服务一方的手写副本；禁止任何"只有 AI 看得见"的隐藏机制。配置可读性（人审得懂）是验收标准——**配置里塞无类型闭包换取"零 JSX"是伪达标，禁止**。

### 3.5 逃生舱：sandbox 棘轮

真缺型组件：写入 `blocks/sandbox/` 命名空间 + 开发态水印 + 强化 lint → 复用 ≥2 处时相似度查重 → `ui:promote` 晋升（不改名，只换 category）。sandbox 使用率是健康指标（持续偏高 = 词表欠债）。**第 8 原型准入门槛**：某 sandbox 同形态页面出现 ≥3 次且判定表可容纳不破坏现有分类，才考虑增设原型；组合页/双栏工作台在 §9 非目标中处理。

---

## 4. AI 指导机制：AGENTS.md + Skills

### 4.1 四层分工

| 层 | 载体 | 常驻? | 职责 |
|---|---|---|---|
| 路由 | `AGENTS.md`（根目录，生成）+ `CLAUDE.md` symlink | 是（~10 行） | "任何页面工作先加载 ui-page skill" + 3 条铁律 |
| 程序 | skills（ui-page/ui-block/ui-theme 三 skill，落 `.zcode/skills/`、`.claude/skills/`、`.agents/skills/` 三目录，单一源生成） | 按需 | 分类 → 抄样例 → 写配置 → 自检 |
| 事实 | `docs/patterns.md`（生成） | 引用 | 原型判定表、词表、精选组合、反模式 |
| 强制 | types + eslint + CI | 机械 | 词表封闭、禁令、截图/分数验收 |

注：Claude Code 默认**仅当 CLAUDE.md 不存在时才读 AGENTS.md**，故生成器同时产出 CLAUDE.md symlink（agents.md 官方推荐做法）。skill 正文**永不罗列 block 名字**。

### 4.2 Skills 规格（3 个）

1. **`ui-page`**：建/改页面总入口。五步：分类（判定表 + §3.2 判别式）→ 抄 patterns 精选组合 → 写配置（默认映射 + 词表内 override；禁 JSX/裸原语/色值）→ `pnpm typecheck && pnpm ui:check` → 交付三态截图 + 规格摘要。反模式节含"这页很特殊 → 99% 不特殊，先看 audit/team 特例"。
2. **`ui-block`**：真缺型唯一合法路径。查重 → sandbox + 水印 → 登记 proposed 清单 → 晋升。
3. **`ui-theme`**：品牌定制唯一入口。preset 选择；改则只动 themes/*.css token；逐组件调色是反模式。

### 4.3 新鲜度与分发（双通道）

- 仓内：AGENTS.md（+symlink）、patterns.md、skills 全部生成物进 CI regen + `git diff --exit-code`。
- 消费端 skills 分发走**双通道**：通道一 registry item（`registry:file` + `~` target 落 `.claude/skills` 等目录——机制可行但属 DIY，无 skill 语义类型）；通道二 **skills.sh 主渠道**（`npx skills add`，生态主通道，但为静态源）。"按消费项目生成变体"与通道二的静态模式有张力，需通道一内嵌渲染脚本自实现（M7-D）。禁裸名引用自家 item：registryDependencies 指向本仓库必须用完整 URL（CLI 语义：裸名永远解析到官方 shadcn）。

---

## 5. M6 —— 地基与结构修复（四象限归位）〔大〕

前置：无。规模：A 中大 / B 中 / C 中 / D 大 / E 小。**排期（已拍板）：A 先行 → B/C/D 三组并行（文件域不相交：B=core 机制、C=core/resource、D=registry+demo 路由）→ E 收尾；M6 整体验收后进 M7，跨阶段不穿插。发布时点：release workflow 仅产出 tag + CHANGELOG（不 npm publish）**（即便未来 publish，也在 M6-D 之后——D 会删并 6 个 item，先发即 breaking）。

**任务**

- **A 发布就绪**：core 补 `@tanstack/react-table` peer dep；license 定 MIT + repository/engines/publishConfig 元数据补全；release workflow（changesets action，**仅 tag + CHANGELOG，不 npm publish**——对外通道维持 GitHub 私有 registry，公开发布待 M8 后另议）；theme 产物追加 `@theme inline` 映射段；registry 配置补 `registry:base` 钉住 Base UI（防 CLI 方言漂移）；`IMPLICIT_NPM_IMPORTS` 收敛（react-query 照常声明）；build.ts 解析 `@/components/ui/*` 补全 registryDependencies，**自家 item 引用一律完整 URL**；CI 加 registry.json 新鲜度 diff（`shadcn registry validate` 已存在，勿重复）；CI 新增 `publint`/`attw` job（`pnpm --filter @patterns-ui/core exec publint && pnpm dlx @arethetypeswrong/cli -P packages/core --profile node16`——npm 上的 `attw` 是防依赖混淆占位包，真身 `@arethetypeswrong/cli`；node10 解析不认 exports map 子路径属结构性无解，检 node16 CJS/ESM 即可）。
- **B 结构归位（下沉）**：`scheduleUndoable` 归位为 data 内部；queryKey 工厂（listKey/detailKey/manyKey）成为 data 公共出口 + 跨模块一致性契约测试；`createStorage(key, zodSchema, {version, migrate})` 统一存储（含租户段拼装），替换 core 5 处 + blocks 2 处手写；**key 变更三处同步**（core 常量 / demo index.html 防闪脚本 / guards G6 matcher）+ 旧数据迁移或显式弃用决策；`useDebouncedCallback`/`isIsoDate`/label 工具单点化；task 轮询统一 `refetchInterval`；**Provider 组件级测试补齐**（auth/tenant/theme：401 快照流转、租户切换清缓存、preset 恢复）；`?page=-1`/`?size=-30` 回落合法值的单测。
- **C L4 健壮化（上浮）**：先给 services def 设 `list.pageSize=30` fixture，再改 `def.list` 配置直灌 `useResourceTable`（单源，消除钳制分叉）；默认 `getId` 改编译期约束；`as never`/`as unknown as` 收敛单点；zod 内省 dev-only。
- **D 变体收敛（下沉）**：shell/sidebar 变体 → 基座 block + `variant` prop（**联动改写消费者**：`routes/_shell/t.$tenantId.tsx` 与 `preview.tsx`，保住 M1"三形态可切换预览"语义）；`AuthCardLayout` 抽取；ErrorPage 参数化单模板；`PageHeader` 共享原语（`text-[22px]` ×14：blocks 11 + demo 3）；过滤树字段级 API 下沉 core/filters；team/notification/global-search 手拼 queryKey 改走公共出口；补 1 条过滤树 e2e（facet 组合 → URL → 刷新还原）；typed-form-field label id 绑定到全部 widget 控件 + `aria-describedby` 关联错误（§2.3 a11y 债务，§8）。
- **E 文案与文档**：block 默认文案对象化（props 可整体覆盖，预留 messageCatalog 形态）；docs 漂移回写（README audit2；milestones checkbox 及 :153 settings"三节"；fresh-clone dev；**blocks.md settings"三分节"→四节**；M6-B 完成后同步 core-api.md §6/§15/exports；architecture.md §2 依赖白名单与 core 实际依赖对齐——use-sync-external-store）；mock 修正（种子模条纹改 PRNG、owner ID 口径统一）；`pnpm review`（build+preview）纳入 CI 冒烟；`api.ts` 2xx JSON 解析兜底确认（现状已有部分 try/catch，缺口确认后修或显式记录拒绝）。

**验收清单（全部可命令判定）**

- [ ] `publint`/`attw` CI job 绿（A）
- [ ] CI `registry-consumer` job：tmp 目录 vite+tailwind init → `shadcn add theme-default status-badge` → `vite build` 成功 → headless 断言 computed color 来自 token（A）
- [ ] `grep -rn "from \"\.\./mutation\"" packages/core/src/data` 为空；全仓（core+registry）无手拼 queryKey 数组、无裸 localStorage 读写（B）；createStorage key 变更后 guards G6 测试同步绿（B）
- [ ] Provider 测试文件存在且覆盖三项关键副作用（B）；`?page=-1`/`?size=-30` 单测存在（B）
- [ ] e2e：`goto('/t/<tid>/services?size=30')` 每页 30 行（C）
- [ ] `find registry/blocks/shell -maxdepth 1 -name 'app-shell-*' | wc -l` = 1 且 `side-nav-*` = 1，preview 页可切三种 variant（D）；`text-[22px]` 全仓 grep 为 0（D）；过滤树 URL 还原 e2e 绿（D）
- [ ] ci.yml 无 `workflow_dispatch` 门（e2e 随 PR）；`pnpm install && pnpm dev` fresh-clone CI job 绿（E）

---

## 6. M7 —— 范式落地（名字层 + 执行层 + 指导层 + 分发）〔全计划最大〕

前置：M6 验收通过。**组内顺序：A1 → A2 → A3 → B → C/D**（截图基线必须在页面迁移后建立；规格核对依赖配置文件落地）。**串行约束：M6-A → M6-D → M7-A1 → M7-C2（build.ts 与 registry 结构/meta 的改动链），禁止并行分支触碰**。

**任务（11 个，每个独立派发）**

- **A1〔中〕生成器与类型层**：`blocks.generated.ts` 生成器（显式注解、JSDoc、提交进 git）；registry meta 增 `archetype` 字段；生成物单测（JSDoc 与 meta description 一致、类型可编译）。
- **A2〔中大〕运行时层**：按原型分组的注入子表 + `definePage<Archetype>` 类型收窄 + name→component 解析出口；`definePage`（slot 组装）/`defineFlow`（步骤流 + **action 词表初版**：navigate/toast/refresh/invalidate/refetch/close/reload/copy/waitDialog/loading 共 10 个，可扩）；detail `kind:"custom"` 改登记制（必须登记 sandbox 名）；**解析器/渲染器/状态机单测（含名字缺失、slot 越界失败路径）**；settings-page 节化改造（sections[] 可扩展）；分页 mode 升格为 def 一等契约节点（page/offset/keyset 封闭词表，与 core-api §3 ListMode 语义对齐并同步改写该节）；错误信封解析出口统一（parseError 单源，替换 form/team-page/error-state 三处自解析）。
- **A3〔大〕页面迁移**：demo 25 个路由文件，18 个分三批配置化——资源 8 页（services×4、audit、api-keys、regions、deployments）走现有 defineResource + resource-list-view/resource-detail-view/表单视图工厂（工厂缺的能力——toolbar 槽、导出、选择、banner、刷新档位、行/头动作、分组开关等——按 slot 结构声明化收编进工厂，页面组装下沉为 def/工厂参数；扩工厂是本批主要工作量）；模式页 6 个（settings、team、notifications、onboarding、search、index）definePage/defineFlow 配置化（宿主 = 对应模式 preset block：settings-page/team-page/notification-inbox/global-search-page…；页面逻辑——client 接线、mutations——以类型化适配器引用进配置，禁 JSX/无类型闭包，§3.4）；auth×4 definePage("auth-flow")。其余 **7 个文件**进**豁免清单**（`403`——ErrorPage 参数化错误小页，不属七原型无法 definePage；`preview`、`dev.audit-legacy`——工具/参照页；`__root`、`_shell.tsx`、`_shell/index.tsx`、`_shell/t.$tenantId.tsx`——布局路由与重定向桩），每个豁免路由文件头部注释声明理由。
- **B1〔中〕@patterns-ui/eslint-plugin**：四规则（pages 无 JSX / 禁裸 table·dialog 原语 / 禁 hex 与 arbitrary tailwind 值 / registry 冻结）+ `--fix`。**工具链决策**：自定义规则走 eslint（biome 不支持自定义规则），作用域仅 pages/registry 目录，biome 保持全仓其余职责。**冻结语义**：路径/name/targetDir 三不变、内容可变（哈希不冻结）。另含：同 archetype 的 item slot 结构一致性 CI 校验（消费 meta.archetype，承接 §3.2）。插件按 npm 包形态开发（flat config preset），规则不依赖仓内路径（服务 M7-D）。
- **B2〔中〕截图基线 + chaos 前置**：三态 = **loading/empty/error**（mock `?demo-error=` 与空过滤构造）；确定性前提：冻结时钟（relative-time 不随墙钟漂移）、禁动画、mock 每 worker 重置；`screenshots/baseline/**` 入库，`toHaveScreenshot(maxDiffPixelRatio: 0.02)`，失败上传 diff artifact。**chaos 开关从 C 挪此**：`?demo-error=` 派发器统一进 mock 入口，覆盖全部 handler 文件（现状仅 2/9）。
- **B3〔中〕一致性分数**：口径 = 可枚举检查项计数（手写拷贝数 / 页面 JSX 文件数 / 词表覆盖页面比例 / sandbox 使用率——§2.3 债务清单的机械化子集，**非平均值**，新增页面不稀释）；`scripts/consistency-score.mjs` + 首份 `scores.json` 基线入库；`ui:score --check` 只许升。
- **B4〔小中〕核对器与编排**：**配置名字 ⊆ 注入表 ∪ sandbox 登记表**三方一致核对（替代"import 图核对"——配置化后页面无组件 import 可比）；`pnpm ui:check` 一条龙（typecheck + lint + regen 新鲜度 + 截图 + 分数 + a11y 检查 + chunk 体积预算报告，承接 §8）。
- **C1〔中〕文档生成器**：AGENTS.md（+ CLAUDE.md symlink）+ patterns.md（原型判定表、判别式、词表、每原型 2-3 精选组合、反模式）；CI regen diff。
- **C2〔中大〕模式一级概念**：registry item 用合法类型（`registry:block`/`registry:item`）+ 附加字段 `pattern: { contractCard, blocks[], metaPatterns[] }`（声明组合了哪些元模式，供 patterns.md 生成器与决策树第二层引用；schema 顶层 additionalProperties 开放，已核实；**不可用自定义 type 值，validate 会拒**；注意：顶层 `pattern` 字段经 CLI zod parse 会被**静默剥离**——validate 通过 ≠ 透传给消费端，仓内生成器读源文件不受影响，消费端契约卡分发另走 `registry:file`）；**抽取 audit-trail、read-state 两个元模式引擎下沉 core**（§1.2 清单"待抽取"项，headless 化 + 失败路径单测）；既有 5 模式补契约卡（含 contractVersion 与两层契约：元模式契约 + 业务契约）；core 元模式 hook 在 dev 模式对注入 adapter 做形状校验 + contractVersion 失配警告；registry.md 同步新增字段与 type 取值清单（`registry:item`/`registry:file`）；`shadcn add --dry-run` 冒烟进 CI。
- **C3〔中〕skills 与验收附件**：ui-page/ui-block/ui-theme 三 skill × 三 agent 目录变体（单一源生成）；`docs/agent-acceptance.md`（标准任务提示词、环境、判定清单）；e2e 补三 spec（422 回填闭环 / 409 并发 / bulk 部分失败）。
- **D〔中〕分发型执行层（已拍板：类型 + skills，lint 暂缓）**：词表类型与解析出口随 core 包分发（消费端装包即得 typecheck 防线，零额外分发成本）；skills 双通道（§4.3，含通道一 registry item 内嵌按项目渲染脚本的自实现）；@patterns-ui/eslint-plugin 本阶段仅本仓 CI 使用，npm 发布推迟至有真实外部消费者反馈后（B1 的"规则不依赖仓内路径"约束即为届时发布预置）。

**验收清单**

- [ ] 写 `cell-statuz` typecheck 报错并列出全部合法 cell 名（A1）；A2 单测含失败路径全绿（A2）
- [ ] `grep -rEl '<[A-Z][a-zA-Z]*' apps/demo/src/pages` 为空（pages/ 纯配置：0 JSX 元素，0 大写泛型实参——配置走类型推断与词表名）且 `ls apps/demo/src/pages/*.page.ts | wc -l` = 18、豁免清单文件头有注释（A3）
- [ ] 故意写 `<table>` 与 `#ff0000`，lint 拦截且 `--fix` 可用（B1）；同 archetype 的 item slot 结构 CI 校验绿（B1）
- [ ] `pnpm ui:shots --check` 与 `pnpm ui:score --check` 在 CI 绿，首份 `scores.json` 基线入库（B2/B3）
- [ ] **agent 验收两层**：自动层 = 新 agent 会话按 agent-acceptance.md 标准任务产出 PR，通过 eslint 全规则 + 三方核对 + sandbox 零新增 + 三态截图；人工层只判配置可读性（C3）
- [ ] `shadcn add <pattern-item> --dry-run` CI 绿（C2）；消费端空白项目装 core 后写错 block 名 typecheck 报错（D）
- [ ] 全部生成物 regen 后 `git diff --exit-code` 干净（C1）

---

## 7. M8 —— 模式与词表补齐〔很大：一交付物一任务〕

前置：M7-C2（模式一级概念与契约卡）。原则：**模式型缺口是差异化主战场，元素型缺口是模式的支撑件；每个模式任务元模式先行**——先 core headless 引擎（含失败路径单测）→ 再 UI 预设 → 最后两层契约卡（§1.2）。例外：纯契约先行的模式（billing，定案 2）不建引擎，以契约卡 + mock 适配器形状验证替代，引擎待真实接入时补建。每任务验收四项通用（模式类另含元模式引擎单测；纯契约先行模式以契约卡 + mock 适配器形状验证替代）：demo 真实路由挂载 + e2e ≥1 条交互链（非截图壳）；契约卡过 validate（模式类）；新词表进 blocks.generated.ts 与 patterns.md（`ui:vocab-diff` 仅新增）；`ui:score --check` 通过。

**波 1（模式开局，overview 转正）**

| # | 任务 | 规模 | 备注 |
|---|---|---|---|
| 1 | dashboard 套件：dashboard-page Layout + 图表包装（shadcn charts/Recharts v3，已验证非 experimental、Base UI 无冲突）+ cell-sparkline + demo 首页重写 | 大 | 先实测 Recharts v3 + React 19 是否需 react-is override |
| 2 | api-key 模式：列表 + scope 选择器 + 一次性 reveal（复用 secret-reveal；demo mock 已有 handlers） | 中小 | |
| 3 | billing 模式：plan 卡 / 发票表 / 席位增减 | 大 | **纯契约先行（已拍板）**：demo 用 mock 适配器验证契约形状；Stripe 适配器待自家产品真实接入计费时后补 |

**波 2（交互与冷启动）**：peek 侧滑详情（form-sheet 壳 + record-pager 联动，中）；批量编辑表单（selection-bar + form-dialog，小）；看板视图（dnd-kit 包装，list 第三 view mode，中）；import 模式（Stepper/Table 自建四步，不引 MUI 依赖，中大）；评论线程 + @提及（中）。

**波 3（开发者面与协作面）**：webhook 模式（中）；integration 模式（中）；日历视图（轻量自建，中）；permissions 模式（中大）；markdown 编辑+渲染成对（中）；AI chat 元素——**消费 shadcn/ui 官方 AI Elements（MIT，2026-08 起官方会话原语；Vercel AI Elements 已宣布 2026-11 弃用，勿选）**，内联源码保留 MIT 头（中小）。

补齐策略：包装上游 = 图表（Recharts）、看板（dnd-kit）、AI（shadcn 官方）、主题 preset；自建 = 导入/计费/API key/peek/批量编辑/评论/日历。判据 §2：引擎不值得重写则包装（UI 跟我们走），上游带不想要的依赖或模式简单则自建。

---

## 8. 非功能需求（本阶段最小集）

- **a11y**：每原型硬性检查项进 ui:check——dialog/sheet/peek 焦点回收、type-to-confirm 读屏语义、表格键盘导航、`aria-describedby` 错误关联（typed-form-field id 绑定已在 M6-D 债务内）。a11y 事后补的成本远高于内建，作为"行为一致性"的组成部分强制。
- **i18n**：明确**非本阶段范围**。M6-E 文案对象化预留 messageCatalog 形态，多语言运行时机制（切语言、格式化重渲染）待真实需求牵引。
- **性能**：demo 路由 chunk 体积预算（`ui:check` 报告项，超限报警）；§3.3 决策记录已禁用全量注入。

## 9. 非目标与边界

- 不覆盖：营销页/落地页、重可视化（大屏/BI）、SSR（auth 单例改造仅消除挂死风险）、非 React 运行时方言（Radix 方言远期候选）。
- **组合页/双栏工作台（持久 master-detail）为非目标**：一律拆路由；peek 侧滑是瞬时形态不是持久双栏。同形态 sandbox ≥3 次可按 §3.5 门槛申请第 8 原型。
- P2 缓行：热力图/地图/甘特/SQL 面板/SSO 配置页/告警构建器——先进 sandbox 观察。
- 不做 AI 专属隐藏机制；渲染器即编译目标，配置即源码。

## 10. 已定案（2026-10-22 评审拍板）

1. **license = MIT，暂不 npm publish**：changesets 仅产出 tag + CHANGELOG；对外分发维持 GitHub 私有 registry 通道；publint/attw 留在 CI 保证随时可发；公开发布待 M8 模式库成熟后另议。
2. **billing 纯契约先行**：模式只定义契约，demo 用 mock 适配器验证形状；Stripe 适配器待自家产品真实接入计费时后补，防 Stripe 私有语义（proration/invoice 状态机）泄漏进通用契约。
3. **M6 内并行、跨阶段串行**：A 先行 → B/C/D 三组并行派发 → E 收尾；M6 整体验收后进 M7 按序执行；M6-D 变体收敛必须先于 M7-A1 生成器（registry 结构依赖，见 §6 串行约束）。
4. **M7-D 范围 = 词表类型 + skills 双通道，eslint-plugin 暂缓发布**：插件仅本仓 CI 使用，发布推迟至有真实外部消费者；typecheck 防线随 core 包零成本分发。

（更早的两项——registry 模式组织形态（`registry:block` + `pattern` 附加字段）、图表选型（shadcn charts / Recharts v3）——已经外部机制验证定案，写在 §1.3 / M7-C2 / §7 正文。）
