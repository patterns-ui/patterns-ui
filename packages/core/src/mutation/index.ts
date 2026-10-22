/**
 * core/mutation —— undoable 时序的兼容出口（docs/core-api.md §6）。
 *
 * M6-B 归位：scheduleUndoable 的实现已下沉为 data 内部（../data/undoable，
 * paradigm.md §2.1 依赖方向：data 不得反向 import mutation）。本模块保留
 * `@patterns-ui/core/mutation` 子路径为纯 re-export —— 现有消费方
 * （registry blocks use-resource-mutations 引用 UndoableToastControl 类型）
 * 无需改导入路径；新代码请从 data 侧（createResource/MutationOpts）接入。
 */

export type { ScheduleUndoable, UndoableJob, UndoableToastControl } from "../data/undoable";
export { scheduleUndoable } from "../data/undoable";
