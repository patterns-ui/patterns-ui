# onboarding 模式契约卡

- **contractVersion**: 1
- **组装入口**: registry block `onboarding`（`shadcn add patterns-ui/patterns-ui/onboarding`；blocks 与 metaPatterns 清单见 meta.pattern，patterns.md 业务模式目录单源发射）

> 首登引导模式：四步把空账号带到可用态——团队定名、首资源落地、成员邀请，步骤间数据保留，回退不丢已填。

## 元模式契约

### flow（core/page defineFlow 引擎，contractVersion 1）

- **步骤机**：四步固定序（欢迎 → 创建首个资源 → 邀请成员 → 完成 summary）；每步「下一步」前校验（可异步），不过不前进且错误可见；上一步回退数据保留。
- **数据保留**：步骤数据合并进 FlowData（submitStep 合并、回退不清空）——完成步的 summary 即保留数据的直接呈现。

### resource-lifecycle（core/data 引擎）

- **端点形状**：创建首个资源 = `create`（适配器注入提交回调）；邀请成员 = invitations `create`（邮箱 + 角色）；提交失败停留本步（步骤校验语义承载）。

## 业务契约

### 领域字段

`FlowData = { teamName: string; firstResource: { … }（宿主资源形状）; invites: { email, role }[] }`。

### 内置决策

- **欢迎步钉团队名**：首步确定团队名，后续步骤与完成 summary 复用（数据保留）。
- **创建首资源异步提交**：提交 pending 有可见等待态，失败停留本步暴露错误（不静默跳步）。
- **邀请步动态行 + 邮箱校验**：邀请行可增删，zod 邮箱校验进步骤校验（不过不前进）。
- **完成步 summary**：回顾团队名/首资源/邀请清单后才退出向导——冷启动结果可核对。

## 变更日志

- v1（2026-10-23）：初版（M7-C2 模式升格为一级概念，补两层契约卡；行为自 M4 落地未变）。
