import type { UseQueryResult } from "@tanstack/react-query";
import { cn } from "cn";
import { RefreshCw } from "lucide-react";
import { RelativeTime } from "@/components/blocks/shared/relative-time/relative-time";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface RefreshBarProps {
  query: Pick<UseQueryResult<unknown>, "refetch" | "isFetching" | "dataUpdatedAt">;
  /** 自动刷新间隔（ms）；false/undefined = 关闭。值由页面持有并注入 useResourceTable queryOptions */
  autoIntervalMs?: number | false;
  onAutoIntervalChange?: (ms: number | false) => void;
  /** 可选间隔档位 */
  intervalOptions?: { label: string; value: number | false }[];
  className?: string;
}

const DEFAULT_INTERVALS: { label: string; value: number | false }[] = [
  { label: "关闭", value: false },
  { label: "5 秒", value: 5000 },
  { label: "15 秒", value: 15000 },
  { label: "30 秒", value: 30000 },
  { label: "60 秒", value: 60000 },
];

/** 刷新条：手动刷新 + 最后更新时间（相对） + 自动刷新开关 */
export function RefreshBar({
  query,
  autoIntervalMs = false,
  onAutoIntervalChange,
  intervalOptions = DEFAULT_INTERVALS,
  className,
}: RefreshBarProps) {
  return (
    <div
      className={cn("text-muted-foreground flex items-center gap-2 text-[13px]", className)}
      data-slot="refresh-bar"
    >
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label="刷新"
        disabled={query.isFetching}
        onClick={() => void query.refetch()}
      >
        <RefreshCw className={cn(query.isFetching && "animate-spin")} />
      </Button>
      {query.dataUpdatedAt > 0 ? (
        <span className="flex items-center gap-1">
          更新于
          <RelativeTime value={query.dataUpdatedAt} />
        </span>
      ) : null}
      {onAutoIntervalChange ? (
        <span className="flex items-center gap-1.5">
          自动刷新
          <Select
            value={autoIntervalMs === false ? "off" : String(autoIntervalMs)}
            onValueChange={(v) => {
              if (v === null || v === "off") onAutoIntervalChange(false);
              else onAutoIntervalChange(Number(v));
            }}
          >
            <SelectTrigger size="sm" className="w-19">
              <SelectValue>
                {intervalOptions.find(
                  (o) =>
                    (o.value === false ? "off" : String(o.value)) ===
                    (autoIntervalMs === false ? "off" : String(autoIntervalMs)),
                )?.label ?? "关闭"}
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {intervalOptions.map((opt) => (
                <SelectItem key={String(opt.value)} value={opt.value === false ? "off" : opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </span>
      ) : null}
    </div>
  );
}
