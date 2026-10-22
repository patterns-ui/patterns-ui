import { useSavedViews } from "@fleetly/patterns-ui-core/list";
import { cn } from "cn";
import { Bookmark, BookmarkCheck, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";

export interface SavedViewsMenuProps {
  /** 命名视图存储 key（localStorage 'fc:view:<resourceKey>'） */
  resourceKey: string;
  className?: string;
}

/** 命名视图下拉：保存当前查询串 / 应用 / 重命名 / 删除（core useSavedViews） */
export function SavedViewsMenu({ resourceKey, className }: SavedViewsMenuProps) {
  const { views, save, apply, remove, update } = useSavedViews(resourceKey);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (saving) nameRef.current?.focus();
  }, [saving]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="outline" size="sm" className={className} />}>
        <Star data-icon="inline-start" />
        视图
        {views.length > 0 ? (
          <span className="bg-muted text-muted-foreground ml-1 rounded-full px-1.5 text-[11px] tabular-nums">
            {views.length}
          </span>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuGroup>
          <DropdownMenuLabel>命名视图</DropdownMenuLabel>

          {saving ? (
            <div className="flex items-center gap-1.5 px-2 py-1.5">
              <Input
                ref={nameRef}
                value={name}
                placeholder="视图名称…"
                className="h-7"
                onChange={(e) => setName((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && name.trim() !== "") {
                    save(name.trim());
                    setName("");
                    setSaving(false);
                  }
                  if (e.key === "Escape") setSaving(false);
                }}
              />
              <Button
                size="xs"
                disabled={name.trim() === ""}
                onClick={() => {
                  save(name.trim());
                  setName("");
                  setSaving(false);
                }}
              >
                保存
              </Button>
            </div>
          ) : (
            <DropdownMenuItem onClick={() => setSaving(true)}>
              <Plus />
              保存当前视图…
            </DropdownMenuItem>
          )}

          {views.length > 0 ? <DropdownMenuSeparator /> : null}
          {views.map((view) =>
            renamingId === view.id ? (
              <div key={view.id} className="flex items-center gap-1.5 px-2 py-1.5">
                <Input
                  autoFocus
                  value={renameValue}
                  className="h-7"
                  onChange={(e) => setRenameValue((e.target as HTMLInputElement).value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && renameValue.trim() !== "") {
                      update(view.id, renameValue.trim());
                      setRenamingId(null);
                    }
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                />
                <Button
                  size="xs"
                  disabled={renameValue.trim() === ""}
                  onClick={() => {
                    update(view.id, renameValue.trim());
                    setRenamingId(null);
                  }}
                >
                  确定
                </Button>
              </div>
            ) : (
              <div key={view.id} className="group/view flex items-center">
                <DropdownMenuItem
                  className="flex-1"
                  onClick={() => {
                    apply(view);
                  }}
                >
                  <Bookmark />
                  <span className="truncate">{view.name}</span>
                </DropdownMenuItem>
                <span
                  className={cn("flex items-center pr-1 opacity-0 group-hover/view:opacity-100")}
                >
                  <button
                    type="button"
                    aria-label="重命名"
                    className="text-muted-foreground hover:text-foreground rounded p-1"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setRenamingId(view.id);
                      setRenameValue(view.name);
                    }}
                  >
                    <Pencil className="size-3" />
                  </button>
                  <button
                    type="button"
                    aria-label="删除"
                    className="text-muted-foreground hover:text-status-danger rounded p-1"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      remove(view.id);
                    }}
                  >
                    <Trash2 className="size-3" />
                  </button>
                </span>
              </div>
            ),
          )}

          {views.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <p className="text-muted-foreground flex items-center gap-1.5 px-2 py-1 text-xs">
                <BookmarkCheck className="size-3" />
                视图保存的是 URL 查询段（过滤/排序/分页）
              </p>
            </>
          ) : null}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
