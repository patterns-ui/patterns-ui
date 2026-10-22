import type { ComponentType, ReactNode } from "react";
import { CellBoolean } from "@/components/blocks/cells/cell-boolean/cell-boolean";
import {
  CellEnumBadge,
  type EnumBadgeOption,
} from "@/components/blocks/cells/cell-enum-badge/cell-enum-badge";
import { CellId } from "@/components/blocks/cells/cell-id/cell-id";
import {
  CellNumber,
  type CellNumberFormat,
} from "@/components/blocks/cells/cell-number/cell-number";
import { CellProgress } from "@/components/blocks/cells/cell-progress/cell-progress";
import { CellStatus } from "@/components/blocks/cells/cell-status/cell-status";
import { CellTags } from "@/components/blocks/cells/cell-tags/cell-tags";
import { CellTime } from "@/components/blocks/cells/cell-time/cell-time";
import { CellUser } from "@/components/blocks/cells/cell-user/cell-user";
import type { StatusBadgeTone } from "@/components/blocks/shared/status-badge/status-badge";

export type CellForType =
  | "id"
  | "time"
  | "status"
  | "user"
  | "boolean"
  | "number"
  | "enum-badge"
  | "tags"
  | "progress";

export interface CellForOptions {
  /** cell-status：值 → tone 映射 */
  map?: Record<string, StatusBadgeTone>;
  /** cell-status：活动态（呼吸点）值 */
  pulseFor?: string[];
  /** cell-number：格式 */
  format?: CellNumberFormat;
  unit?: string;
  /** cell-enum-badge：选项表 */
  options?: EnumBadgeOption[];
  /** cell-boolean：文案 */
  labels?: [string, string];
  /** cell-tags：最多展示数 */
  max?: number;
  /** cell-id：截断位数（缺省组件默认） */
  chars?: number;
  /** cell-user：id + resolve 解析形态（外键列声明式渲染；resolve 为类型化适配器） */
  resolve?: (id: string) => { name: string; avatarUrl?: string } | undefined;
}

/** cellFor 产出的统一 cell 组件 props（value 来自列 accessor） */
export interface CellForValueProps {
  value: unknown;
}

/**
 * type → cell 组件映射器（L4 inferColumns / 手写列定义共用）。
 *
 * ```tsx
 * const TimeCell = cellFor("time");
 * const cols = [helper.accessor("createdAt", { cell: (info) => <TimeCell value={info.getValue()} /> })];
 * ```
 */
export function cellFor(
  type: CellForType,
  opts: CellForOptions = {},
): ComponentType<CellForValueProps> {
  const components: Record<CellForType, (p: { value: unknown }) => ReactNode> = {
    id: ({ value }) => (
      <CellId value={typeof value === "string" ? value : String(value ?? "")} chars={opts.chars} />
    ),
    time: ({ value }) => <CellTime value={value as string | number | Date | undefined} />,
    status: ({ value }) => (
      <CellStatus value={value as string | undefined} map={opts.map} pulseFor={opts.pulseFor} />
    ),
    user: ({ value }) =>
      opts.resolve !== undefined ? (
        <CellUser id={String(value ?? "")} resolve={opts.resolve} />
      ) : (
        <CellUser user={value as never} />
      ),
    boolean: ({ value }) => (
      <CellBoolean value={value as boolean | undefined} labels={opts.labels} />
    ),
    number: ({ value }) => (
      <CellNumber value={value as number | undefined} format={opts.format} unit={opts.unit} />
    ),
    "enum-badge": ({ value }) => (
      <CellEnumBadge value={value as string | undefined} options={opts.options ?? []} />
    ),
    tags: ({ value }) => (
      <CellTags values={Array.isArray(value) ? (value as string[]) : undefined} max={opts.max} />
    ),
    progress: ({ value }) => <CellProgress value={value as never} />,
  };
  const render = components[type];
  function CellForValue({ value }: CellForValueProps) {
    return render({ value });
  }
  return CellForValue;
}
