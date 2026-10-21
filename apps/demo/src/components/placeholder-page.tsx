import { RelativeTime } from "@/components/blocks/shared/relative-time/relative-time";
import { ResourceIcon } from "@/components/blocks/shared/resource-icon/resource-icon";
import { Card, CardContent } from "@/components/ui/card";

/**
 * M1 占位页：资源页（services/deployments/…）在 M2/M3 接入真实数据前的统一占位。
 */
export function PlaceholderPage({
  kind,
  title,
  description,
}: {
  kind: string;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center gap-3">
        <span className="bg-muted text-muted-foreground flex size-10 items-center justify-center rounded-lg">
          <ResourceIcon kind={kind} className="size-5" />
        </span>
        <div className="flex flex-col gap-0.5">
          <h1 className="text-[22px] font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground text-[13px]">{description}</p>
        </div>
      </div>
      <Card>
        <CardContent className="flex flex-col gap-2 px-5 py-8 text-[13px] text-muted-foreground">
          <p>此页面为占位 —— 列表 / 详情 / 表单自 M2 起接入（mock 端点 + ResourceClient）。</p>
          <p className="flex items-center gap-2">
            最近更新：
            <RelativeTime value={Date.now() - 42 * 60_000} intervalMs={10_000} />
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
