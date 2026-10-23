# audit-log 模式契约卡

- **contractVersion**: 1
- **组装入口**: registry block `audit-log`（`shadcn add patterns-ui/patterns-ui/audit-log`；blocks 与 metaPatterns 清单见 meta.pattern，patterns.md 业务模式目录单源发射）

> 审计日志模式：谁在什么时间对哪些资源做了什么——keyset 追溯流，事件只追加不改写，检索以时间窗为主轴。

## 元模式契约

### audit-trail（core/audit 引擎，contractVersion 1）

- **端点形状**：适配器 = Resource（`client.list(params)` 必须兑现 `cursor` / `filters`（action in、resource/actor contains、createdAt between）/ `search` / `facets: ["action"]` 契约；`createResource` 产出即满足）。
- **分页协议**：keyset 钉死（无 page/offset 选项——协议选择是模式决策，见业务契约「内置决策」）；承载档 paged（cursor 前后翻，缺省）/ load-more（累计拼接）。
- **append-only 语义**：游标栈在过滤会话内只追加、后退指针回移不弹栈（keyset 页不可变 → 命中缓存零请求）；筛选/搜索/排序/页大小变更清栈回第 1 页；cursor token 留内存不进 URL。
- **错误语义**：data 模块 HttpError 分档（401/403/404/409/5xx/网络），三态由 async-state 承担。
- **dev 适配器校验**：挂载时 zod 形状校验注入 Resource（name/useList/client.list）；适配器可携带 `contractVersion` 供失配警告。

### list-browse（core/list 引擎）

- URL 即事实源（q/动作/资源/操作者/时间范围/sort/size 可还原）；pageSize 钳制（档位 [10/20/50] ∪ 缺省 20）；保存视图与筛选必重置语义由引擎统一承载。

### reference-resolution（core/reference 引擎）

- actor 以 id 传输，展示侧经 `resolveActor` 注入反查（同 id 共享解析缓存）；引擎不假设用户表结构。

## 业务契约

### 领域字段

`AuditEventRow = { id: string; action: string; resource: string; actor: string; createdAt: string; ip?: string }`（列定义内置 id/action/resource/actor/createdAt；ip 为可选附加列位）。

### 内置决策

- **keyset 而非 offset 分页**：审计日志是 append 流，新事件持续写入使 offset 漂移（翻页跳行/重复不可接受）；游标锚定稳定排序位，Relay/search_after 类后端归一为同一 keyset 协议。
- **时间范围窗口（createdAt date-range）**：审计检索以时间窗为主轴，窗口即过滤；窗口变更回第 1 页并清游标栈。
- **action facet 计数**：服务端返回 action 计数（facets: ["action"]），facet chips 与勾选联动；动作枚举由宿主注入（actionOptions）。
- **actor 以 id 传输、展示侧反查**：数据层不绑定用户表结构，CellUser + resolveActor 组合解耦。
- **staleTime 10s**：审计页多为回溯阅读，10 秒缓冲降低来回翻页的重复请求。

## 变更日志

- v1（2026-10-23）：初版。audit-trail 元模式引擎自 audit-log block 抽取下沉 core（M7-C2），行为等价迁移（keyset 双档 / 过滤面 / facet / 搜索面全部保留）。
