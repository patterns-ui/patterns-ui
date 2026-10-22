# demo 应用（Fleetly Console）

`@fleetly/patterns-ui` 的完整示例应用：TanStack Router 文件路由 + shadcn（Base UI 方言）+
Tailwind v4，blocks 经 `@/components/blocks` alias 直接引用 `registry/blocks`（单一事实源）。

```bash
pnpm dev              # http://localhost:5173（mock API 内置于 vite middleware）
pnpm test             # 守卫测试（vitest）
pnpm test:e2e         # Playwright 冒烟主链路
```

登录：`demo@fleetly.dev`，密码任意（演示环境不发送真实邮件）。

## demo 里每个页面验证了库的哪些能力

页面本身按真实产品文案编写；本表是给库使用者/维护者看的「页面 ↔ 库能力」对照，不出现在任何页面 UI 里。

| 页面（路由）                                   | 验证的库能力                                                                                                                                                                                                                                                                                                            |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview `/t/:tid`                             | StatStrip + 资源 facets 聚合计数（`useList({ facets })`）；跨页 Link 携带过滤参数（`?status=degraded` 直达过滤态）                                                                                                                                                                                                      |
| Services 列表 `/t/:tid/services`               | `useResourceTable` server-offset 全家桶：URL 事实源（q/filters/sort/page/size 全进 URL）、多列排序、facets 侧栏、saved views、分组（`?group=on` + 聚合）、CSV 导出、undoable 删除（乐观变更 + 撤销）、`RefreshBar` 自动刷新（默认关，显式开启才轮询）、`NewItemsBanner` 新数据信号、列偏好持久化（显隐/顺序/宽度/密度） |
| Services 详情 `/t/:tid/services/:id`           | DetailPage 模板 + DetailGrid + InlineEditField（乐观更新）、RecordPager、子资源部署列表（keyset）、行内编辑 changeSet（useInlineEdit 批量提交）、Timeline、DangerZone（type-to-confirm）                                                                                                                                |
| 部署 Sheet（详情页内）                         | FormSheet + Stepper 分步表单（逐步校验）、KvPairs/Select 联动、`useTaskSubmit` 长任务（queued→running→终态轮询）、条件轮询（仅存在进行中部署时每 2s）                                                                                                                                                                   |
| Services 新建/编辑 `/services/new` `/:id/edit` | FormPage + `useResourceForm`：草稿自动保存/恢复、dirty guard（导航/刷新拦截）、服务端 422 字段错误回填、409 乐观并发冲突流、DiffViewer 变更摘要                                                                                                                                                                         |
| Audit `/t/:tid/audit`（L4 旗舰页）             | `defineResource` 一份声明 → `resourceListRouteOptions`（validateSearch/静态标题）+ `ResourceListView` 一行装配；`inferColumns` 推断列（dev 模式 Guesser 打印可粘贴配置）；server-cursor 分页 + action facets + 时间范围过滤                                                                                             |
| Audit 内部对照 `/t/:tid/dev/audit-legacy`      | 手写 M2 实现（约 220 行）与 L4 版（约 60 行）功能等价对照：cursor token 栈翻页 vs load-more 累计拼接、高级 and/or 过滤树、FacetSidebar、展开行。**不进导航与 ⌘K**，仅作库回归对照                                                                                                                                       |
| API Keys `/t/:tid/api-keys`                    | FormDialog 小表单宿主、一次性 secret 展示（SecretReveal）、DangerZone type-to-confirm 吊销                                                                                                                                                                                                                              |
| Team `/t/:tid/team`                            | team-page block 全流程：邀请 → 待处理 → 接受（mock 按钮）→ 改角色 → 移除                                                                                                                                                                                                                                                |
| Notifications `/t/:tid/notifications`          | NotificationInbox（keyset + 单条已读 + read-all）；顶栏未读数与收件箱共享 queryKey 缓存                                                                                                                                                                                                                                 |
| Regions `/t/:tid/regions`                      | 树形表格（getSubRows + 折叠）、聚合 footer（sum/avg）、1000 行指标采样虚拟滚动（≥200 行自动启用）                                                                                                                                                                                                                       |
| Settings `/t/:tid/settings`                    | settings-page block：组织/个人/安全/外观（theme + preset 切换，唯一 preset 入口）                                                                                                                                                                                                                                       |
| Onboarding `/t/:tid/onboarding`                | Onboarding 多步向导（步骤间数据保留、真实创建/邀请端点）                                                                                                                                                                                                                                                                |
| Search `/t/:tid/search`                        | GlobalSearchPage 跨资源搜索（防抖 + 分资源结果）                                                                                                                                                                                                                                                                        |
| ⌘K 命令面板                                    | `navFromResources(resourceDefs)` 与手动 nav 合并 —— 面板与侧栏同一数据源；搜索兜底跳全站搜索                                                                                                                                                                                                                            |
| 认证页 `/auth/*`、`/403`                       | sign-in/up/otp/forgot 页模板、requireAuth/requireRole 守卫、`next` 回跳                                                                                                                                                                                                                                                 |
| 组件预览 `/t/:tid/preview`（不进导航）         | 3 套 AppShell × 3 套 SideNav 舞台切换 + 状态件陈列（StatusBadge/EmptyState/ErrorState/AvatarStack）                                                                                                                                                                                                                     |

## dev-only 便利（不影响产品形态）

- 顶栏无 preset 切换器（在 Settings → 外观）；`/dev/audit-legacy` 与 `/preview` 不出现在导航和 ⌘K。
- mock 触发器：Services 搜索 `boom` → 500 错误态；新建服务名称含 `taken` → 422 字段错误回填；
  编辑页「模拟他人抢先保存」→ 409 冲突流；部署表单「模拟失败」→ failed 终态。
- mock 数据时间锚点是启动时刻（时间列默认相对形态）；services 120 行 / audit 320 行 / metrics 1000 行。

## 守卫测试（`src/guards/guards.test.ts`）

六条守卫扫真实源码并配反例自测：禁裸 fetch、禁手拼资源 queryKey、禁阻塞式对话框、
禁绕过 TenantProvider 直写 localStorage、registry blocks 禁硬编码色值、index.html 防闪脚本与 core 等价。
