/**
 * diff-viewer —— JSON 树 diff + 行 diff 两模式（删除/新增/变更三色语义走 status token）。
 */
import { cn } from "cn";
import { useMemo, useState } from "react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type DiffOp = "added" | "removed" | "changed" | "unchanged";

export interface DiffEntry {
  /** 点路径（a.b.0.c） */
  path: string;
  op: DiffOp;
  before?: unknown;
  after?: unknown;
}

const opBadge: Record<DiffOp, { label: string; cls: string }> = {
  added: { label: "新增", cls: "bg-status-success-bg text-status-success" },
  removed: { label: "删除", cls: "bg-status-danger-bg text-status-danger" },
  changed: { label: "变更", cls: "bg-status-warning-bg text-status-warning" },
  unchanged: { label: "不变", cls: "bg-muted text-muted-foreground" },
};

function stringify(value: unknown): string {
  if (value === undefined) return "—";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2) ?? String(value);
  } catch {
    return String(value);
  }
}

/** 扁平 diff：两对象按点路径逐键对比（数组按下标；仅报告差异项）。 */
export function diffRecords(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown> | undefined,
): DiffEntry[] {
  const out: DiffEntry[] = [];
  const walk = (b: unknown, a: unknown, path: string) => {
    const bObj = b !== null && typeof b === "object" ? (b as Record<string, unknown>) : undefined;
    const aObj = a !== null && typeof a === "object" ? (a as Record<string, unknown>) : undefined;
    if (bObj !== undefined || aObj !== undefined) {
      const keys = [...new Set([...Object.keys(bObj ?? {}), ...Object.keys(aObj ?? {})])];
      keys.sort();
      for (const key of keys) {
        walk(bObj?.[key], aObj?.[key], path === "" ? key : `${path}.${key}`);
      }
      return;
    }
    if (b === undefined && a !== undefined) {
      out.push({ path, op: "added", after: a });
    } else if (b !== undefined && a === undefined) {
      out.push({ path, op: "removed", before: b });
    } else if (JSON.stringify(b) !== JSON.stringify(a)) {
      out.push({ path, op: "changed", before: b, after: a });
    }
  };
  walk(before, after, "");
  return out;
}

export interface DiffViewerProps {
  before: unknown;
  after: unknown;
  /** 初始模式，默认 'json' */
  mode?: "json" | "lines";
  /** json 树模式是否显示未变更键（默认仅差异） */
  showUnchanged?: boolean;
  /** 空差异占位 */
  emptyLabel?: string;
  className?: string;
}

/**
 * 两版对比查看器：
 * - json 模式：diffRecords 扁平对比 → 差异行表（路径 + before/after + 三色徽标）；
 * - lines 模式：两侧字符串逐行对照（左删右增），适合长文本/JSON 序列化后对比。
 */
export function DiffViewer({
  before,
  after,
  mode = "json",
  showUnchanged = false,
  emptyLabel = "没有差异",
  className,
}: DiffViewerProps) {
  const [current, setCurrent] = useState<"json" | "lines">(mode);

  const entries = useMemo(
    () =>
      diffRecords(
        before !== null && typeof before === "object"
          ? (before as Record<string, unknown>)
          : undefined,
        after !== null && typeof after === "object"
          ? (after as Record<string, unknown>)
          : undefined,
      ),
    [before, after],
  );

  const beforeLines = useMemo(() => stringify(before).split("\n"), [before]);
  const afterLines = useMemo(() => stringify(after).split("\n"), [after]);

  return (
    <div className={cn("space-y-3", className)}>
      <Tabs value={current} onValueChange={(v) => setCurrent(v as "json" | "lines")}>
        <TabsList>
          <TabsTrigger value="json">字段对比</TabsTrigger>
          <TabsTrigger value="lines">逐行对比</TabsTrigger>
        </TabsList>
      </Tabs>

      {current === "json" ? (
        entries.length === 0 && !showUnchanged ? (
          <p className="text-muted-foreground text-sm">{emptyLabel}</p>
        ) : (
          <div className="divide-border overflow-hidden rounded-lg border">
            {entries.length === 0 ? (
              <p className="text-muted-foreground px-4 py-3 text-sm">{emptyLabel}</p>
            ) : (
              entries.map((entry) => (
                <div
                  key={entry.path}
                  className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-4 gap-y-1 px-4 py-2.5 text-sm sm:grid-cols-[110px_minmax(0,2fr)_minmax(0,2fr)]"
                >
                  <span className="text-muted-foreground overflow-hidden font-mono text-xs">
                    {entry.path}
                  </span>
                  <span className="min-w-0">
                    <span
                      className={cn(
                        "mr-2 inline-block rounded px-1.5 py-0.5 text-xs font-medium",
                        opBadge[entry.op].cls,
                      )}
                    >
                      {opBadge[entry.op].label}
                    </span>
                    {entry.op === "added" ? null : (
                      <code className="text-muted-foreground block truncate font-mono text-xs strike">
                        {stringify(entry.before)}
                      </code>
                    )}
                    {entry.op === "removed" ? null : (
                      <code className="block truncate font-mono text-xs">
                        {stringify(entry.after)}
                      </code>
                    )}
                  </span>
                </div>
              ))
            )}
          </div>
        )
      ) : (
        <div className="grid grid-cols-2 overflow-hidden rounded-lg border">
          <div className="border-r">
            <div className="bg-muted/50 text-muted-foreground border-b px-3 py-1.5 text-xs font-medium">
              变更前
            </div>
            <pre className="overflow-x-auto p-3 text-xs leading-5">
              {beforeLines.map((line, i) => (
                <div
                  key={i}
                  className={cn(
                    "font-mono",
                    afterLines[i] !== undefined &&
                      afterLines[i] !== line &&
                      "bg-status-danger-bg/60 text-status-danger",
                  )}
                >
                  {line === "" ? "\u00A0" : line}
                </div>
              ))}
            </pre>
          </div>
          <div>
            <div className="bg-muted/50 text-muted-foreground border-b px-3 py-1.5 text-xs font-medium">
              变更后
            </div>
            <pre className="overflow-x-auto p-3 text-xs leading-5">
              {afterLines.map((line, i) => (
                <div
                  key={i}
                  className={cn(
                    "font-mono",
                    beforeLines[i] !== undefined &&
                      beforeLines[i] !== line &&
                      "bg-status-success-bg/60 text-status-success",
                  )}
                >
                  {line === "" ? "\u00A0" : line}
                </div>
              ))}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
