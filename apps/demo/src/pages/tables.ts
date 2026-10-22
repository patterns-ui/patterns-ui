/**
 * demo 注入子表（M7-A3）：按原型分组的完整 BlockTable（core-api.md §17.1）。
 *
 * 漏注入任何一个合法名 = 编译错（typecheck 合法值域与注入表同域）；本文件是 demo
 * 全部 PageRenderer 消费方的唯一注入点（词表名 → 组件，禁散落注入、禁 JSX 包装）。
 */

import type { BlockTable } from "@patterns-ui/core/page";
import type { ComponentType } from "react";
import { AuthCardLayout } from "@/components/blocks/auth/auth-card-layout/auth-card-layout";
import { ForgotPasswordPage } from "@/components/blocks/auth/forgot-password-page/forgot-password-page";
import { Onboarding } from "@/components/blocks/auth/onboarding/onboarding";
import { OtpPage } from "@/components/blocks/auth/otp-page/otp-page";
import { SignInPage } from "@/components/blocks/auth/sign-in-page/sign-in-page";
import { SignUpPage } from "@/components/blocks/auth/sign-up-page/sign-up-page";
import { Stepper } from "@/components/blocks/form/stepper/stepper";
import { TypedField } from "@/components/blocks/form/typed-form-field/typed-form-field";
import { DataTable } from "@/components/blocks/list/data-table/data-table";
import { ExportButton } from "@/components/blocks/list/export-button/export-button";
import { FacetSidebar } from "@/components/blocks/list/facet-sidebar/facet-sidebar";
import { FilterBar } from "@/components/blocks/list/filter-bar/filter-bar";
import { ListPage } from "@/components/blocks/list/list-page/list-page";
import { NewItemsBanner } from "@/components/blocks/list/new-items-banner/new-items-banner";
import { NotificationInbox } from "@/components/blocks/list/notification-inbox/notification-inbox";
import { PaginationBar } from "@/components/blocks/list/pagination-bar/pagination-bar";
import { RefreshBar } from "@/components/blocks/list/refresh-bar/refresh-bar";
import { SelectionBar } from "@/components/blocks/list/selection-bar/selection-bar";
import { SettingsPage } from "@/components/blocks/settings/settings-page/settings-page";
import { AsyncState } from "@/components/blocks/shared/async-state/async-state";
import { EmptyState } from "@/components/blocks/shared/empty-state/empty-state";
import { StatStrip } from "@/components/blocks/shared/stat-strip/stat-strip";
import { GlobalSearchPage } from "@/components/blocks/shell/global-search-page/global-search-page";
import { DangerZone } from "@/components/blocks/show/danger-zone/danger-zone";
import { TeamPage } from "@/components/blocks/team/team-page/team-page";

/** auth-flow：壳 + 四张内嵌壳的表单页 */
export const authFlowTable: BlockTable<"auth-flow"> = {
  "auth-card-layout": AuthCardLayout,
  "forgot-password-page": ForgotPasswordPage,
  "otp-page": OtpPage,
  "sign-in-page": SignInPage,
  "sign-up-page": SignUpPage,
};

/** settings：设置壳 + 扩展节挂载位 */
export const settingsTable: BlockTable<"settings"> = {
  "settings-page": SettingsPage,
  "danger-zone": DangerZone,
};

/** resource-list：list-page 宿主 + 全部 toolbar/filters/view/empty 填充 + 模式预设宿主 */
export const resourceListTable: BlockTable<"resource-list"> = {
  "list-page": ListPage,
  "team-page": TeamPage,
  "notification-inbox": NotificationInbox,
  "global-search-page": GlobalSearchPage,
  "filter-bar": FilterBar,
  "facet-sidebar": FacetSidebar,
  "data-table": DataTable,
  "pagination-bar": PaginationBar,
  "async-state": AsyncState,
  "empty-state": EmptyState,
  "selection-bar": SelectionBar,
  "refresh-bar": RefreshBar,
  "new-items-banner": NewItemsBanner,
  "export-button": ExportButton,
};

/** wizard：stepper 宿主 + onboarding 预设 + 步骤表单件 */
export const wizardTable: BlockTable<"wizard"> = {
  onboarding: Onboarding,
  stepper: Stepper,
  "typed-form-field": TypedField as unknown as ComponentType,
};

/** overview：宿主域当前仅 stat-strip（dashboard-page M8 波1 落地后扩域） */
export const overviewTable: BlockTable<"overview"> = {
  "stat-strip": StatStrip,
};
