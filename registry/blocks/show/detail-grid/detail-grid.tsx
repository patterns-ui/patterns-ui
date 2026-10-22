/**
 * detail-grid —— 键值两列区（值经 cells 渲染）。
 */
import { cn } from "cn";
import type { ReactNode } from "react";
import {
  type CellForOptions,
  type CellForType,
  cellFor,
} from "@/components/blocks/cells/cell-for/cell-for";
import { InlineEditField } from "@/components/blocks/show/inline-edit-field/inline-edit-field";
import { ReferenceField } from "@/components/blocks/show/reference-field/reference-field";

/** DetailGrid 扩展 cell 名（M7-A3 声明式详情：cellFor 家族外的三个键值区渲染器） */
export type DetailGridCellType = CellForType | "inline-edit" | "reference" | "mono";

/** 扩展 cell 的选项（cellFor 家族键 + inline-edit/reference/mono 消费键） */
export type DetailGridCellOptions = CellForOptions & {
  /** inline-edit：编辑类型 */
  type?: "text" | "number";
  /** mono：前缀 */
  prefix?: string;
  /** reference：外键 label 读取（参数为资源行记录的松形态） */
  getIdLabel?: (row: Record<string, unknown>) => string;
  resource?: { useOne?: unknown } & Record<string, unknown>;
  /** inline-edit：保存适配器（value, data）——宿主注入（含 mutation 接线） */
  onSave?: (value: string | number, data: Record<string, unknown>) => Promise<void>;
};

export interface DetailGridItem {
  label: string;
  /** 取值字段名（从 data 读取） */
  field: string;
  /** cells 渲染器类型（缺省原样输出） */
  cell?: DetailGridCellType;
  /** cell 渲染选项（cellFor 参数） */
  cellOptions?: DetailGridCellOptions;
  /** 完全自定义渲染（优先于 cell） */
  render?: (value: unknown, data: Record<string, unknown>) => ReactNode;
  /** 值为空时占位 */
  fallback?: ReactNode;
}

export interface DetailGridProps {
  items: DetailGridItem[];
  data: Record<string, unknown> | undefined;
  /** 列数（1-3，默认 2） */
  columns?: 1 | 2 | 3;
  title?: string;
  description?: string;
  className?: string;
}

const columnClass = {
  1: "sm:grid-cols-1",
  2: "sm:grid-cols-2",
  3: "sm:grid-cols-3",
} as const;

/** 键值两列网格：label 上、值下；值经 cellFor(cells) 渲染或 render 自定义。 */
export function DetailGrid({
  items,
  data,
  columns = 2,
  title,
  description,
  className,
}: DetailGridProps) {
  const cellCache = new Map<string, ReturnType<typeof cellFor>>();
  return (
    <section className={cn("space-y-4", className)}>
      {title ? (
        <div>
          <h2 className="text-sm font-medium">{title}</h2>
          {description ? <p className="text-muted-foreground text-sm">{description}</p> : null}
        </div>
      ) : null}
      <dl className={cn("grid grid-cols-1 gap-x-8 gap-y-5", columnClass[columns])}>
        {items.map((item) => {
          const value = data ? data[item.field] : undefined;
          const empty = value === undefined || value === null || value === "";
          let content: ReactNode;
          if (item.render) {
            content = item.render(value, data ?? {});
          } else if (item.cell === "inline-edit") {
            const save = item.cellOptions?.onSave;
            content = (
              <InlineEditField
                value={value as string | number}
                type={item.cellOptions?.type}
                onSave={
                  save === undefined
                    ? undefined
                    : async (next) => {
                        await save(next, data ?? {});
                      }
                }
              />
            );
          } else if (item.cell === "reference") {
            content = (
              <ReferenceField
                resource={item.cellOptions?.resource as never}
                id={String(value ?? "")}
                getIdLabel={item.cellOptions?.getIdLabel as never}
              />
            );
          } else if (item.cell === "mono") {
            content = (
              <span className="font-mono text-xs">
                {item.cellOptions?.prefix ?? ""}
                {String(value ?? "")}
              </span>
            );
          } else if (item.cell) {
            if (!cellCache.has(item.cell)) {
              cellCache.set(item.cell, cellFor(item.cell, item.cellOptions));
            }
            const CellComponent = cellCache.get(item.cell) as React.ComponentType<{
              value: unknown;
            }>;
            content = <CellComponent value={value} />;
          } else {
            content = empty ? null : <span className="text-sm break-all">{String(value)}</span>;
          }
          return (
            <div key={item.field + item.label} className="space-y-1">
              <dt className="text-muted-foreground text-xs font-medium tracking-wider uppercase">
                {item.label}
              </dt>
              <dd className="text-foreground text-sm">
                {empty && !item.render ? (
                  <span className="text-muted-foreground/70">{item.fallback ?? "—"}</span>
                ) : (
                  content
                )}
              </dd>
            </div>
          );
        })}
      </dl>
    </section>
  );
}
