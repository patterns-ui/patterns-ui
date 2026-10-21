import { useNavigate } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import {
  Command,
  CommandEmpty,
  CommandGroup as CommandGroupUI,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

export interface CommandItemDef {
  id: string;
  label: string;
  icon?: LucideIcon;
  /** 搜索匹配关键词 */
  keywords?: string[];
  /** 导航目标（优先）；与 run 二选一 */
  to?: string;
  /** 自定义动作 */
  run?: () => void;
}

export interface CommandGroupDef {
  label: string;
  items: CommandItemDef[];
}

export interface CommandPaletteSearchFallback {
  /** 全站搜索入口文案模板（q = 当前输入；缺省「全站搜索「q」」） */
  label?: (q: string) => string;
  /** 回车/选中时执行（通常：关闭面板 + 跳 /search?q=） */
  run: (q: string) => void;
}

export interface CommandPaletteProps {
  groups: CommandGroupDef[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 触发快捷键（默认 ⌘K / Ctrl+K 全局监听） */
  shortcutEnabled?: boolean;
  /** 全站搜索兜底项：输入非空时置顶展示，回车直达搜索页（⌘K → ?q= 链路） */
  searchFallback?: CommandPaletteSearchFallback;
}

/**
 * ⌘K 全局命令面板：groups 内 item.to 走路由导航，item.run 执行自定义动作。
 * 由宿主持有 open 状态（TopBar 的搜索按钮与快捷键都会触发）。
 */
export function CommandPalette({
  groups,
  open,
  onOpenChange,
  shortcutEnabled = true,
  searchFallback,
}: CommandPaletteProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!shortcutEnabled) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onOpenChange, shortcutEnabled]);

  const handleSelect = (item: CommandItemDef) => {
    onOpenChange(false);
    if (item.to !== undefined) {
      navigate({ to: item.to as never });
    } else {
      item.run?.();
    }
  };

  const searchItem =
    searchFallback && query.trim() !== ""
      ? {
          id: "__global_search",
          label: searchFallback.label ? searchFallback.label(query) : `全站搜索「${query}」`,
          run: () => {
            searchFallback.run(query);
          },
        }
      : undefined;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-20 translate-y-0 overflow-hidden p-0 sm:max-w-lg">
        <DialogTitle className="sr-only">命令面板</DialogTitle>
        <DialogDescription className="sr-only">搜索页面或执行动作</DialogDescription>
        <Command onValueChange={setQuery}>
          <CommandInput placeholder="输入命令或搜索…" />
          <CommandList>
            <CommandEmpty>没有匹配的结果</CommandEmpty>
            {searchItem ? (
              <CommandGroupUI heading="搜索">
                <CommandItem
                  value={`${searchItem.label} search 全站`}
                  onSelect={() => {
                    onOpenChange(false);
                    searchItem.run();
                  }}
                >
                  <Search />
                  <span>{searchItem.label}</span>
                  <CommandShortcut>回车</CommandShortcut>
                </CommandItem>
              </CommandGroupUI>
            ) : null}
            {groups.map((group) => (
              <CommandGroupUI key={group.label} heading={group.label}>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <CommandItem
                      key={item.id}
                      value={[item.label, ...(item.keywords ?? [])].join(" ")}
                      onSelect={() => handleSelect(item)}
                    >
                      {Icon ? <Icon /> : null}
                      <span>{item.label}</span>
                      {item.to !== undefined ? <CommandShortcut>跳转</CommandShortcut> : null}
                    </CommandItem>
                  );
                })}
              </CommandGroupUI>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
