/**
 * notification-inbox —— 通知收件箱页（docs/blocks.md list/）。
 *
 * 数据走 ResourceClient 约定：list（keyset/offset 均可，read 过滤参数透传）、
 * PATCH 单条已读（update(id, {read:true})）、POST 全部已读（bulkUpdate 约定或 host 自接）。
 * 通知行形状（约定字段）：{ id, type, title, body?, read, createdAt, actor? }。
 */
import type { ListParams, Page, ResourceClient } from "@patterns-ui/core/data";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "cn";
import { AlertTriangle, CheckCheck, CreditCard, type LucideIcon, Rocket } from "lucide-react";
import { useEffect, useState } from "react";
import { CellUser } from "@/components/blocks/cells/cell-user/cell-user";
import { RelativeTime } from "@/components/blocks/shared/relative-time/relative-time";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

/** 约定的通知行形状 */
export interface NotificationRow {
  id: string;
  type: string; // 'deploy' | 'alert' | 'billing' | …
  title: string;
  body?: string;
  read: boolean;
  createdAt: string;
  actor?: { name: string; avatarUrl?: string };
}

/** type → 图标（可注入扩展；缺省 Bell） */
const TYPE_ICONS: Record<string, LucideIcon> = {
  deploy: Rocket,
  alert: AlertTriangle,
  billing: CreditCard,
};

export interface NotificationInboxProps {
  /** 通知资源客户端（list 必须；markAll 可选缺省逐条 update） */
  client: {
    list(params: ListParams): Promise<Page<NotificationRow>>;
    update?(id: string, vars: Partial<NotificationRow>): Promise<NotificationRow>;
    /** 全部已读专用端点（POST /read-all 之类）；缺省回落逐条 update */
    markAllRead?(ids: string[]): Promise<unknown>;
  };
  /** 列表拉取条数（默认 30） */
  pageSize?: number;
  /** 标题 */
  title?: string;
  /** 未读数变化回调（top-bar badge 数据位） */
  onUnreadCountChange?(count: number): void;
  className?: string;
}

const INBOX_KEY = "notification-inbox";

export function NotificationInbox({
  client,
  pageSize = 30,
  title = "通知",
  onUnreadCountChange,
  className,
}: NotificationInboxProps) {
  const queryClient = useQueryClient();
  const [markingAll, setMarkingAll] = useState(false);

  const query = useQuery({
    queryKey: [INBOX_KEY, "list", pageSize],
    queryFn: () => client.list({ pageSize, sort: [{ field: "createdAt", direction: "desc" }] }),
  });

  const rows = query.data?.rows ?? [];
  const unread = rows.filter((row) => !row.read);

  useEffect(() => {
    onUnreadCountChange?.(unread.length);
  }, [unread.length, onUnreadCountChange]);

  const markRead = useMutation({
    mutationFn: async (row: NotificationRow) => {
      if (client.update) return client.update(row.id, { read: true });
      return row;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: [INBOX_KEY, "list"] });
    },
  });

  const markAll = async (): Promise<void> => {
    setMarkingAll(true);
    try {
      const unreadIds = unread.map((row) => row.id);
      if (client.markAllRead) {
        await client.markAllRead(unreadIds);
      } else if (client.update) {
        await Promise.all(unreadIds.map((id) => client.update?.(id, { read: true })));
      }
      await queryClient.invalidateQueries({ queryKey: [INBOX_KEY, "list"] });
    } finally {
      setMarkingAll(false);
    }
  };

  return (
    <section
      className={cn("bg-card overflow-hidden rounded-xl border", className)}
      data-slot="notification-inbox"
    >
      <header className="flex items-center justify-between border-b px-5 py-3.5">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-medium">{title}</h2>
          {unread.length > 0 ? (
            <Badge variant="secondary" className="tabular-nums">
              {unread.length} 未读
            </Badge>
          ) : null}
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={markingAll || unread.length === 0}
          onClick={() => void markAll()}
        >
          <CheckCheck data-icon="inline-start" />
          全部已读
        </Button>
      </header>

      {query.isLoading ? (
        <div className="space-y-3 px-5 py-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <Skeleton className="size-8 rounded-lg" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-2/3" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground px-5 py-12 text-center text-sm">没有通知</p>
      ) : (
        <ul className="divide-border divide-y">
          {rows.map((row) => {
            const Icon = TYPE_ICONS[row.type];
            return (
              <li
                key={row.id}
                className={cn(
                  "flex items-start gap-3 px-5 py-3.5 transition-colors",
                  !row.read && "bg-primary/[0.04]",
                )}
              >
                <span
                  className={cn(
                    "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
                    row.read
                      ? "bg-muted text-muted-foreground ring-border"
                      : "bg-primary/10 text-primary ring-primary/20",
                  )}
                >
                  {Icon ? <Icon className="size-4" /> : null}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-[13px]", row.read ? "" : "font-medium")}>
                    {row.title}
                    {!row.read ? (
                      <span className="bg-primary ml-2 inline-block size-1.5 rounded-full align-middle" />
                    ) : null}
                  </p>
                  {row.body ? (
                    <p className="text-muted-foreground mt-0.5 line-clamp-2 text-[13px]">
                      {row.body}
                    </p>
                  ) : null}
                  <p className="text-muted-foreground/80 mt-1 flex items-center gap-2 text-xs">
                    {row.actor ? <CellUser user={row.actor} size="sm" /> : null}
                    <span className="text-muted-foreground/60">{row.type}</span>
                    <RelativeTime value={row.createdAt} />
                  </p>
                </div>
                {!row.read ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    disabled={markRead.isPending}
                    onClick={() => markRead.mutate(row)}
                  >
                    标为已读
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {query.data?.nextCursor !== undefined ? (
        <footer className="border-t px-5 py-2.5">
          <span className="text-muted-foreground text-xs">
            更早通知走 keyset 下一页（cursor: {query.data.nextCursor.slice(0, 20)}…）
          </span>
        </footer>
      ) : null}
    </section>
  );
}

/** 未读数查询（top-bar badge 用；与收件箱同一 queryKey 前缀共享缓存） */
export function useUnreadCount(client: {
  list(params: ListParams): Promise<Page<NotificationRow>>;
}): number {
  const query = useQuery({
    queryKey: [INBOX_KEY, "list", 30],
    queryFn: () => client.list({ pageSize: 30 }),
    // 与 NotificationInbox 相同 key → 缓存共享；staleTime 抑制重复请求
    staleTime: 15_000,
  });
  return (query.data?.rows ?? []).filter((row) => !row.read).length;
}

export type NotificationClient = ResourceClient<NotificationRow>;
