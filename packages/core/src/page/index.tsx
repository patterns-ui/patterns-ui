/**
 * core/page —— 范式运行时层（M7-A2，docs/core-api.md §17）。
 *
 * paradigm §3.3 名字间接层的运行时半边：配置写名字（definePage）/ 类型查名字（/vocab）/
 * 本模块运行时解析名字（resolveBlock）并渲染（renderPage）。含 JSX 故入口为 index.tsx。
 * 子路径决策：flow 引擎与 action 词表并入 ./page（flow 是页面级元模式、definePage 的
 * step/transition 槽位直接消费 Action 类型，拆分会让 A3 页面配置跨两个 import 面）。
 */
export {
  ACTION_DOCS,
  ACTION_NAMES,
  type Action,
  type ActionContext,
  type ActionExecutor,
  type ActionExecutorOptions,
  type ActionName,
  type ActionPayloadMap,
  assertActionName,
  runActions,
  useActionExecutor,
} from "./actions";
export {
  type BlockTable,
  PAGE_BLOCKS_BY_ARCHETYPE,
  PAGE_SLOT_FILLS,
  type PageBlockNameFor,
  SLOT_NAMES_BY_ARCHETYPE,
} from "./blocks";
export {
  type AuthFlowPageConfig,
  type AuthFlowStepConfig,
  definePage,
  type OverviewChartConfig,
  type OverviewPageConfig,
  type OverviewStatCardConfig,
  type PageConfig,
  type PageConfigBase,
  type PageConfigFor,
  type PageSchema,
  type ResourceDetailPageConfig,
  type ResourceDetailSectionConfig,
  type ResourceDetailTabConfig,
  type ResourceFormPageConfig,
  type ResourceListPageConfig,
  type ResourceListViewSlot,
  type RowActionConfig,
  type SettingsPageConfig,
  type SettingsSectionConfig,
  type SettingsSectionPreset,
  type WizardPageConfig,
  type WizardStepConfig,
  type WizardTransitionConfig,
} from "./define";
export {
  createFlowMachine,
  defineFlow,
  type FlowConfig,
  type FlowData,
  type FlowMachine,
  type FlowRuntimeOptions,
  type FlowState,
  type FlowStatus,
  type FlowStepConfig,
  type FlowTransitionConfig,
  type FlowValidateResult,
  useFlow,
} from "./flow";
export {
  PageRenderer,
  type PageRenderPlan,
  planPage,
  renderPage,
  resolveBlock,
} from "./renderer";
