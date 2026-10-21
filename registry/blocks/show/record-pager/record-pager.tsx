/**
 * record-pager —— 上一条/下一条（基于来源列表 query 的相邻记录）。
 * 相邻 id 取自列表 query 已加载页；导航保留来源 search（TanStack Router 相对导航）。
 */

import { useNavigate } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";

export interface RecordPagerProps {
  /** 来源列表的 rows（通常为 useResourceTable().query.data?.rows；已按当前排序） */
  rows: { id: string }[] | undefined;
  currentId: string | undefined;
  /**
   * 相邻记录目标路径工厂（默认当前路径替换 id 段：`..` + `/${id}`）。
   * 返回相对/绝对 path；null = 禁用跳转。
   */
  to?: (id: string) => string;
  /** 计数展示文案（默认「i / n」） */
  label?: (index: number, total: number) => string;
}

/**
 * 记录翻页：在来源列表的相邻记录间跳转（保留当前路由 search，如 tab/过滤态）。
 * 未在 rows 中找到 currentId（如深链直入）时仅展示禁用态。
 */
export function RecordPager({ rows, currentId, to, label }: RecordPagerProps) {
  const navigate = useNavigate();

  const position = useMemo(() => {
    if (rows === undefined || currentId === undefined) return undefined;
    const index = rows.findIndex((row) => row.id === currentId);
    return index < 0 ? undefined : { index, total: rows.length };
  }, [rows, currentId]);

  if (position === undefined) return null;
  const { index, total } = position;
  const prev = index > 0 ? rows?.[index - 1] : undefined;
  const next = index < total - 1 ? rows?.[index + 1] : undefined;

  const go = (row: { id: string } | undefined) => {
    if (row === undefined) return;
    const target = to ? to(row.id) : `../${encodeURIComponent(row.id)}`;
    if (target === null) return;
    void navigate({ to: target, search: true } as never);
  };

  return (
    <nav className="text-muted-foreground flex items-center gap-1.5 text-sm" aria-label="记录翻页">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={prev === undefined}
        aria-label="上一条"
        onClick={() => go(prev)}
      >
        <ChevronLeft /> 上一条
      </Button>
      <span className="text-foreground tabular-nums">
        {label ? label(index + 1, total) : `${index + 1} / ${total}`}
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={next === undefined}
        aria-label="下一条"
        onClick={() => go(next)}
      >
        下一条 <ChevronRight />
      </Button>
    </nav>
  );
}
