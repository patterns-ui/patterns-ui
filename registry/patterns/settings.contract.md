# settings 模式契约卡

- **contractVersion**: 1
- **组装入口**: registry block `settings-page`（`shadcn add patterns-ui/patterns-ui/settings-page`；blocks 与 metaPatterns 清单见 meta.pattern，patterns.md 业务模式目录单源发射）

> 设置模式：sections[] 装配的设置壳——内置五节开箱即用，计费/集成等扩展节同位挂载；外观定制只走 theme token。

## 元模式契约

### resource-lifecycle（core/data 引擎）

- **端点形状**：org / profile 更新走 `update`（适配器实现）；改密码为专用端点（经适配器注入提交回调）；422/400 字段错误回填（parseError 单源）；保存成功失效联动由适配器失效前缀约定。
- **低风险字段 inline-edit**：组织名/头像就地编辑（inline-edit-field，Enter 保存 / Esc 取消）——资源生命周期的小步写档。

## 业务契约

### 领域字段

`org = { name, avatarUrl? }`；`profile = { name, email, … }`；改密码 `{ current, next, confirm }`（zod 一致性校验）；`sessions`（当前设备标记 + 远端会话）；`appearance = { theme: light|dark|system, preset }`。

### 内置决策

- **五节预置（org/profile/security/sessions/appearance）**：sections[] 显式声明可裁剪/重排；缺省 = 内置五节（org 节仅有 org 数据时出现——数据可选节）。
- **扩展节同位挂载**：计费/集成等扩展节与预置节同构挂载（danger-zone 即此形态）；预置节集合只追加（org/profile/security/sessions/appearance）。
- **组织名/头像 inline-edit**：低风险字段就地编辑，不开表单宿主。
- **改密码走专用表单 + zod 校验**：current/next/confirm 三段一致性强校验在前端，提交错误按信封回填。
- **登出全部会话（当前设备保持登录）**：会话节的破坏性动作明确豁免当前设备，防自锁。
- **外观节只切 theme/preset**：外观定制收敛到 theme toggle + preset 切换（core/theme 单源），不引入色值与任意样式。

## 变更日志

- v1（2026-10-23）：初版（M7-A2 节化改造后的形态；M7-C2 补两层契约卡，行为未变）。
