/**
 * core/vocab —— 封闭词表出口（docs/paradigm.md §3.3 名字间接层，M7-A1）。
 *
 * blocks.generated.ts 由 `pnpm vocab:generate` 生成并提交进 git（registry meta/themes 为唯一
 * 事实源）；本入口手写，运行时解析出口（name → component，按原型分组的注入子表）随 M7-A2
 * 在此追加。类型随包分发：消费端装包即得 typecheck 防线（M7-D 分发型执行层）。
 */
export * from "./blocks.generated";
