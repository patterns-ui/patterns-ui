/**
 * reference-field —— 外键显示（异步解析 label；core useReferenceLabel）。
 */

import type { Resource } from "@fleetly/ui-component-core/data";
import { useReferenceLabel } from "@fleetly/ui-component-core/reference";
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";

export interface ReferenceFieldProps {
  resource: Resource<any, any, any>;
  id: string | undefined;
  /** label 取值（默认 name ?? title ?? id） */
  getIdLabel?: (row: any) => string;
  /** 解析失败/为空时的占位 */
  fallback?: ReactNode;
  /** 渲染自定义内容（默认纯文本） */
  render?: (label: string | undefined, row: any) => ReactNode;
}

/** 外键 → 异步 label（共享 useReference 缓存：同 id 多处只解析一次）。 */
export function ReferenceField({
  resource,
  id,
  getIdLabel,
  fallback,
  render,
}: ReferenceFieldProps) {
  const enabled = id !== undefined && id !== "";
  const { labels, isLoading, data } = useReferenceLabel(resource, enabled ? [id] : [], getIdLabel);
  if (!enabled) return <span className="text-muted-foreground/70">{fallback ?? "—"}</span>;
  if (isLoading) return <Skeleton className="h-4 w-24" />;
  const label = labels[id as string];
  if (render) return <>{render(label, data[id as string])}</>;
  if (label === undefined)
    return <span className="text-muted-foreground/70">{fallback ?? id}</span>;
  return <span>{label}</span>;
}
