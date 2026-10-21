import type { UseQueryResult } from "@tanstack/react-query";
import { FilterX, Plus } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyState } from "@/components/blocks/shared/empty-state/empty-state";
import { ErrorState } from "@/components/blocks/shared/error-state/error-state";
import { ListSkeleton, type SkeletonVariant } from "@/components/blocks/shared/skeleton/skeleton";
import { Button } from "@/components/ui/button";

export interface AsyncStateProps {
  query: UseQueryResult<unknown>;
  /** 当前可见行数（区分骨架 / 空数据 / 空过滤） */
  rowsEmpty: boolean;
  /** 是否存在已应用的过滤/搜索（空结果时给「清除过滤」CTA） */
  hasActiveFilters?: boolean;
  onClearFilters?: () => void;
  /** 空数据（非过滤导致）配置 */
  empty?: { title?: string; description?: string; action?: ReactNode };
  onRetry?: () => void;
  /** 骨架形态，默认 table */
  skeletonVariant?: SkeletonVariant;
  skeletonRows?: number;
  children: ReactNode;
}

/**
 * 四态容器：loading→骨架 / error→error-state+重试 / 空数据→empty-state /
 * 空过滤→清除过滤 CTA / 其余渲染 children。
 * loading 判定：首次加载（isPending）或「无可展示数据且正在取数」（翻页 keep 的场景不闪骨架）。
 */
export function AsyncState({
  query,
  rowsEmpty,
  hasActiveFilters = false,
  onClearFilters,
  empty,
  onRetry,
  skeletonVariant = "table",
  skeletonRows = 8,
  children,
}: AsyncStateProps) {
  if (query.isError) {
    return <ErrorState error={query.error} onRetry={onRetry ?? (() => void query.refetch())} />;
  }

  const loading = query.isPending || (rowsEmpty && query.isFetching);
  if (loading) {
    return <ListSkeleton variant={skeletonVariant} rows={skeletonRows} />;
  }

  if (rowsEmpty && hasActiveFilters && onClearFilters) {
    return (
      <EmptyState
        icon={FilterX}
        title="没有匹配的结果"
        description="当前过滤条件下没有数据，试试调整或清除过滤。"
        action={
          <Button variant="outline" size="sm" onClick={onClearFilters}>
            清除过滤
          </Button>
        }
        className="py-12"
      />
    );
  }

  if (rowsEmpty) {
    return (
      <EmptyState
        icon={Plus}
        title={empty?.title ?? "还没有数据"}
        description={empty?.description ?? "数据创建后会出现在这里。"}
        action={empty?.action}
        className="py-12"
      />
    );
  }

  return <>{children}</>;
}
