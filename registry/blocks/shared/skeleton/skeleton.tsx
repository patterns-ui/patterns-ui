import { cn } from "cn";
import { Skeleton } from "@/components/ui/skeleton";

export type SkeletonVariant = "table" | "detail" | "form" | "card";

export interface ListSkeletonProps {
  variant: SkeletonVariant;
  /** table 行数（默认 8）；detail/form 的区块数 */
  rows?: number;
  className?: string;
}

/** 骨架体系：table（表头+行）/ detail（键值两列）/ form（分区字段）/ card（标题+正文）四形态 */
export function ListSkeleton({ variant, rows = 8, className }: ListSkeletonProps) {
  if (variant === "table") {
    return (
      <div
        className={cn("w-full space-y-0 overflow-hidden rounded-lg border", className)}
        data-slot="skeleton-table"
        aria-busy="true"
      >
        <div className="bg-muted/50 flex items-center gap-4 border-b px-4 py-3">
          <Skeleton className="size-4 rounded-[4px]" />
          {["w-[24%]", "w-[14%]", "w-[14%]", "w-[12%]", "w-[12%]"].map((w, i) => (
            <Skeleton key={i} className={cn("h-3.5", w)} />
          ))}
          <div className="flex-1" />
        </div>
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-4 border-b px-4 py-4 last:border-b-0">
            <Skeleton className="size-4 rounded-[4px]" />
            {["w-[24%]", "w-[14%]", "w-[14%]", "w-[12%]", "w-[12%]"].map((w, j) => (
              <Skeleton key={j} className={cn("h-3.5", w)} />
            ))}
            <div className="flex-1" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === "detail") {
    return (
      <div className={cn("space-y-8", className)} data-slot="skeleton-detail" aria-busy="true">
        <div className="flex items-center gap-4">
          <Skeleton className="size-14 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-5 w-1/3" />
            <Skeleton className="h-3.5 w-1/5" />
          </div>
        </div>
        {Array.from({ length: Math.max(2, Math.ceil(rows / 3)) }).map((_, i) => (
          <div key={i} className="space-y-3">
            <Skeleton className="h-4 w-24" />
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, j) => (
                <Skeleton key={j} className="h-3.5 w-full" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (variant === "form") {
    return (
      <div className={cn("space-y-8", className)} data-slot="skeleton-form" aria-busy="true">
        {Array.from({ length: Math.max(2, Math.ceil(rows / 3)) }).map((_, i) => (
          <div key={i} className="space-y-4">
            <Skeleton className="h-4 w-28" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Skeleton className="h-8 w-full rounded-lg" />
              <Skeleton className="h-8 w-full rounded-lg" />
              <Skeleton className="h-8 w-full rounded-lg" />
              <Skeleton className="h-8 w-full rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // card
  return (
    <div
      className={cn("rounded-xl border p-5", className)}
      data-slot="skeleton-card"
      aria-busy="true"
    >
      <Skeleton className="h-4 w-20" />
      <Skeleton className="mt-3 h-[30px] w-24" />
      <Skeleton className="mt-2 h-3.5 w-32" />
    </div>
  );
}
