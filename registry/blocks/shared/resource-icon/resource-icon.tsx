import {
  Box,
  Building,
  Circle,
  Gauge,
  KeyRound,
  type LucideIcon,
  Rocket,
  ScrollText,
  Search,
  Settings,
  User,
  Users,
} from "lucide-react";

/** 内置资源类型 → 图标映射（可用 icons prop 注入/覆盖） */
export const defaultResourceIcons: Record<string, LucideIcon> = {
  service: Box,
  services: Box,
  deployment: Rocket,
  deployments: Rocket,
  audit: ScrollText,
  "audit-event": ScrollText,
  "api-key": KeyRound,
  "api-keys": KeyRound,
  team: Users,
  member: User,
  org: Building,
  tenant: Building,
  settings: Settings,
  search: Search,
  metric: Gauge,
};

export interface ResourceIconProps {
  kind: string;
  /** 注入/覆盖映射表（与内置表合并，注入优先） */
  icons?: Record<string, LucideIcon>;
  className?: string;
}

/** 资源类型 → 图标（未知类型回落 Circle） */
export function ResourceIcon({ kind, icons, className }: ResourceIconProps) {
  const table = icons ? { ...defaultResourceIcons, ...icons } : defaultResourceIcons;
  const Icon = table[kind] ?? Circle;
  return <Icon className={className ?? "size-4"} aria-hidden="true" />;
}
