/**
 * global-search-page —— 跨资源搜索结果页（docs/blocks.md shell/）。
 *
 * ⌘K 命令面板回车进入（?q= 进 URL）；每个资源一个 section（label + 结果列表），
 * 命中段 <mark> 高亮；输入防抖（默认 250ms）后并发查询各资源。
 */
import { useQueries } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { cn } from "cn";
import { Loader2, type LucideIcon, SearchX } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { EmptyState } from "@/components/blocks/shared/empty-state/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

export interface GlobalSearchResultItem {
  /** 资源内唯一键 */
  id: string;
  /** 主标题（高亮匹配段） */
  title: string;
  /** 副标题（描述 / ref） */
  subtitle?: string;
  /** 跳转目标 */
  to?: string;
}

export interface GlobalSearchResourceDef {
  /** 资源名（section 标题） */
  name: string;
  label: string;
  icon?: LucideIcon;
  /** 搜索实现：返回 top N（建议 ≤5） */
  search(q: string): Promise<GlobalSearchResultItem[]>;
}

export interface GlobalSearchPageProps {
  resources: GlobalSearchResourceDef[];
  /** 防抖（默认 250ms） */
  debounceMs?: number;
  /** 每资源返回上限（提示用，具体由 search 实现决定） */
  limit?: number;
  className?: string;
}

export function GlobalSearchPage({
  resources,
  debounceMs = 250,
  limit = 5,
  className,
}: GlobalSearchPageProps) {
  const navigate = useNavigate();
  // ?q= 进 URL（URL 即事实源）；搜索框草稿本地防抖
  const search = useSearch({ strict: false }) as { q?: string };
  const urlQ = typeof search.q === "string" ? search.q : "";
  const [draft, setDraft] = useState(urlQ);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setDraft(urlQ);
  }, [urlQ]);

  useEffect(() => {
    if (draft === urlQ) return;
    const timer = setTimeout(() => {
      void navigate({
        search: ((prev: Record<string, unknown>) => ({ ...prev, q: draft || undefined })) as never,
      });
    }, debounceMs);
    return () => clearTimeout(timer);
  }, [draft, urlQ, debounceMs, navigate]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const queries = useGlobalSearchQueries(resources, urlQ);

  const searching = urlQ.trim() !== "";
  const anyLoading = searching && queries.some((q) => q.isLoading);
  const total = queries.reduce((n, q) => n + (q.data?.length ?? 0), 0);

  return (
    <div className={cn("mx-auto w-full max-w-3xl", className)} data-slot="global-search-page">
      <div className="flex flex-col gap-2">
        <h1 className="text-[22px] font-semibold tracking-tight">搜索</h1>
        <p className="text-muted-foreground text-[13px]">
          跨资源搜索（各资源 top {limit}）；关键词保留在 URL（?q=），可直接分享。
        </p>
      </div>

      <form
        className="relative mt-4"
        onSubmit={(e) => {
          e.preventDefault();
          inputRef.current?.blur();
        }}
      >
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="搜索服务、成员、审计事件…"
          aria-label="搜索关键词"
          className="bg-background h-11 w-full rounded-xl border pr-10 pl-4 text-sm outline-none"
        />
        {anyLoading ? (
          <Loader2 className="text-muted-foreground absolute top-1/2 right-3.5 size-4 -translate-y-1/2 animate-spin" />
        ) : null}
      </form>

      {!searching ? (
        <EmptyState
          className="mt-10"
          icon={SearchX}
          title="输入关键词开始搜索"
          description="结果按资源分组展示，命中片段高亮。"
        />
      ) : total === 0 && !anyLoading ? (
        <EmptyState
          className="mt-10"
          icon={SearchX}
          title={`没有找到与「${urlQ}」相关的结果`}
          description="试试更短的关键词，或切换资源。"
        />
      ) : (
        <div className="mt-4 flex flex-col gap-6">
          {resources.map((resource, i) => {
            const q = queries[i];
            const items = q?.data ?? [];
            if (!q?.isLoading && items.length === 0) return null;
            const Icon = resource.icon;
            return (
              <section key={resource.name} className="bg-card overflow-hidden rounded-xl border">
                <header className="flex items-center gap-2 border-b px-4 py-2.5">
                  {Icon ? <Icon className="text-muted-foreground size-4" /> : null}
                  <h2 className="text-[13px] font-medium">{resource.label}</h2>
                  <span className="text-muted-foreground text-xs tabular-nums">
                    {q?.isLoading ? "…" : `${items.length} 结果`}
                  </span>
                </header>
                {q?.isLoading ? (
                  <div className="space-y-2 px-4 py-3">
                    {[0, 1].map((k) => (
                      <div key={k} className="flex items-center gap-3">
                        <Skeleton className="size-7 rounded-md" />
                        <div className="flex-1 space-y-1.5">
                          <Skeleton className="h-3.5 w-1/2" />
                          <Skeleton className="h-3 w-1/4" />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <ul className="divide-border divide-y">
                    {items.map((item) => (
                      <li key={item.id}>
                        {item.to ? (
                          <a
                            href={item.to}
                            className="hover:bg-muted/40 flex items-center gap-3 px-4 py-3 transition-colors"
                          >
                            <ResultMeta item={item} q={urlQ} />
                          </a>
                        ) : (
                          <div className="flex items-center gap-3 px-4 py-3">
                            <ResultMeta item={item} q={urlQ} />
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ResultMeta({ item, q }: { item: GlobalSearchResultItem; q: string }) {
  return (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium">
          <Highlight text={item.title} q={q} />
        </p>
        {item.subtitle ? (
          <p className="text-muted-foreground truncate text-xs">
            <Highlight text={item.subtitle} q={q} />
          </p>
        ) : null}
      </div>
      <code className="text-muted-foreground/70 shrink-0 font-mono text-[11px]">{item.id}</code>
    </>
  );
}

/** 命中段 <mark> 高亮（大小写不敏感；空 q 原样返回） */
export function Highlight({ text, q }: { text: string; q: string }) {
  const parts = useMemo(() => splitHighlight(text, q), [text, q]);
  if (parts.length === 1 && parts[0]?.kind === "plain") {
    return <>{text}</>;
  }
  return (
    <>
      {parts.map((part, i) =>
        part.kind === "match" ? (
          <mark key={i} className="bg-primary/20 text-primary rounded-sm px-0.5">
            {part.text}
          </mark>
        ) : (
          <span key={i}>{part.text}</span>
        ),
      )}
    </>
  );
}

type HighlightPart = { kind: "plain" | "match"; text: string };

export function splitHighlight(text: string, q: string): HighlightPart[] {
  const needle = q.trim();
  if (needle === "") return [{ kind: "plain", text }];
  const lower = text.toLowerCase();
  const needleLower = needle.toLowerCase();
  const parts: HighlightPart[] = [];
  let cursor = 0;
  let idx = lower.indexOf(needleLower);
  while (idx !== -1) {
    if (idx > cursor) parts.push({ kind: "plain", text: text.slice(cursor, idx) });
    parts.push({ kind: "match", text: text.slice(idx, idx + needle.length) });
    cursor = idx + needle.length;
    idx = lower.indexOf(needleLower, cursor);
  }
  if (cursor < text.length) parts.push({ kind: "plain", text: text.slice(cursor) });
  return parts;
}

/** 并发查询各资源（useQueries：动态并行查询的官方形态） */
function useGlobalSearchQueries(resources: GlobalSearchResourceDef[], q: string) {
  return useQueries({
    queries: resources.map((resource) => ({
      queryKey: ["global-search", resource.name, q],
      queryFn: () => resource.search(q),
      enabled: q.trim() !== "",
      staleTime: 10_000,
    })),
  });
}
