# team 模式契约卡

- **contractVersion**: 1
- **组装入口**: registry block `team-page`（`shadcn add patterns-ui/patterns-ui/team-page`；blocks 与 metaPatterns 清单见 meta.pattern，patterns.md 业务模式目录单源发射）

> 团队管理模式：成员在册（角色可改）、邀请在外（可撤销）——在册走资源生命周期，邀请走待处理区，两态严格分离。

## 元模式契约

### resource-lifecycle（core/data 引擎）

- **端点形状**：members 与 invitations 各为一 Resource（`create` / `update` / `delete` 面按需实现；邀请撤销 = `delete invitation`）；422/400 字段错误经错误信封解析（parseError 单源）回填表单；删除/更新失效联动（list + detail 前缀）由 createResource 统一承载。
- **写入一致**：改角色 / 移除成员为低冲突写（不带 If-Match）；如宿主要求乐观并发，适配器在 update 抛 HttpError(409)。

### list-browse（core/list 引擎）

- 成员表列偏好（localStorage）、行操作菜单、2FA 徽章列；列表无过滤面（成员集小），不引入 URL 过滤协议。

### auth-rbac（core/auth 引擎）

- 角色枚举语义（owner/admin/member…）由宿主注入（Select 选项）；权限判定建议接 core `useCan`（fail-closed）控制行操作可见性——模式不内置角色层级。

## 业务契约

### 领域字段

`Member = { id, name, email, role, twoFactor?, createdAt, … }`；`Invitation = { id, email, role, status, createdAt, … }`（状态机 pending → accepted/revoked）。

### 内置决策

- **邀请可撤销**：邀请在接受前可撤销（delete invitation），不留悬挂凭证；已接受的邀请进入成员表，不再是邀请。
- **改角色行内即提交**：角色变更是低风险高频操作，Select 行内提交（pessimistic 确认后刷新）；不做行内草稿。
- **移除成员走 confirm**：破坏性操作两段式确认（confirm-dialog）；高危场景可升级 type-to-confirm。
- **邀请表单 422 回填**：邮箱重复等字段错误按错误信封契约回填到表单字段（extractFieldErrors/parseError 单源）。
- **2FA 状态可见**：成员行展示 twoFactor 徽章（安全态一眼可见，不折叠进详情）。

## 变更日志

- v1（2026-10-23）：初版（M7-C2 模式升格为一级概念，补两层契约卡；行为自 M4 落地未变）。
