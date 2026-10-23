# notification 模式契约卡

- **contractVersion**: 1
- **组装入口**: registry block `notification-inbox`（`shadcn add patterns-ui/patterns-ui/notification-inbox`；blocks 与 metaPatterns 清单见 meta.pattern，patterns.md 业务模式目录单源发射）

> 通知模式：未读是一等状态——收件箱与 top-bar 徽标共享同一份读态缓存，已读动作精确到条，全部已读一次往返。

## 元模式契约

### read-state（core/read 引擎，contractVersion 1）

- **端点形状**：适配器 = client（`list(params)` 必须兑现 pageSize=30 档；`update(id, { read: true })` 单条已读 PATCH；`markAllRead(ids)` 全部已读专用端点可选，缺省回落逐条 update 扇出）。
- **未读计数共享缓存**：同一缓存命名空间（本模式定名 `notification-inbox`）的取数点共享 queryKey `[name, 'list', pageSize]`——badge 与收件箱不重复请求（badge 侧 staleTime 15s）。
- **读态翻转**：pessimistic（缺省，服务器确认后失效刷新）/ optimistic（乐观翻转，失败回滚 + 失效）——引擎能力，本模式内置选择见业务契约。
- **dev 适配器校验**：挂载时 zod 形状校验注入 client（list 必须，update/markAllRead 可选）；适配器可携带 `contractVersion` 供失配警告。

### list-browse（core/list 引擎）

- 首页取数走 keyset（`nextCursor` 提示更早通知走下一页）；时间倒序（createdAt desc）。

## 业务契约

### 领域字段

`NotificationRow = { id: string; type: string; title: string; body?: string; read: boolean; createdAt: string; actor?: { name; avatarUrl? } }`。

### 内置决策

- **pessimistic 读态翻转（缺省）**：服务器确认后才翻已读——与收件箱的审计可见性一致（不产生本地已读假象）；乐观翻转（引擎能力）预留给高频读态流（如 M8 评论线程）。
- **未读计数共享缓存**：badge 与收件箱同一 queryKey（模式定名 notification-inbox），15s staleTime 抑制重复请求。
- **全部已读优先专用端点**：`markAllRead(ids)` 一次往返；无专用端点的后端自动回落逐条 PATCH 扇出（对宿主透明）。
- **类型图标映射可注入**：缺省 deploy/alert/billing 三类，未命中不渲染图标（不猜语义）。
- **时间倒序 + relative-time 活渲染**：createdAt desc 缺省排序；相对时间活更新由 shared relative-time 承担。

## 变更日志

- v1（2026-10-23）：初版。read-state 元模式引擎自 notification-inbox block 抽取下沉 core（M7-C2），行为等价迁移（共享缓存 key / 单条已读 / 全部已读回落语义全部保留）。
