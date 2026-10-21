import { Download, LoaderCircle } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export interface ExportColumn<T> {
  key: string;
  header: string;
  /** 自定义序列化（默认 String(value)，undefined → 空串） */
  format?: (row: T) => string | number | undefined;
}

export interface ExportButtonProps<T> {
  /** 以当前应用的过滤/排序状态全量取数（由页面用 client.list 逐页拉齐后返回） */
  fetch: () => Promise<T[]>;
  columns: ExportColumn<T>[];
  filename: string;
  label?: string;
  className?: string;
  onExported?: (count: number) => void;
  onError?: (error: unknown) => void;
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsv<T>(rows: T[], columns: ExportColumn<T>[]): string {
  const header = columns.map((c) => csvEscape(c.header)).join(",");
  const body = rows
    .map((row) =>
      columns
        .map((c) => {
          const value = c.format ? c.format(row) : (row as Record<string, unknown>)[c.key];
          return csvEscape(value === undefined || value === null ? "" : String(value));
        })
        .join(","),
    )
    .join("\n");
  return `${header}\n${body}`;
}

/** CSV 导出：按当前应用状态全量取数 → CSV（BOM 头保证 Excel 中文不乱码）→ 触发下载 */
export function ExportButton<T>({
  fetch,
  columns,
  filename,
  label = "导出 CSV",
  className,
  onExported,
  onError,
}: ExportButtonProps<T>) {
  const [busy, setBusy] = useState(false);

  const run = async (): Promise<void> => {
    setBusy(true);
    try {
      const rows = await fetch();
      const csv = toCsv(rows, columns);
      const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
      onExported?.(rows.length);
    } catch (error) {
      onError?.(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className={className ?? undefined}
      disabled={busy}
      onClick={() => void run()}
      data-slot="export-button"
    >
      {busy ? (
        <LoaderCircle data-icon="inline-start" className="animate-spin" />
      ) : (
        <Download data-icon="inline-start" />
      )}
      {label}
    </Button>
  );
}
