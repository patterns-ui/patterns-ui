import { useTheme } from "@patterns-ui/core/theme";
import { Check, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface PresetOption {
  id: string;
  label: string;
}

/** 主题 preset 切换下拉（default / aurora / …由宿主传入） */
export function PresetSwitcher({ presets }: { presets: PresetOption[] }) {
  const { preset, setPreset } = useTheme();
  const current = presets.find((p) => p.id === preset);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={<Button variant="ghost" size="sm" aria-label="切换主题样式" title="主题样式" />}
      >
        <Palette data-icon="inline-start" />
        <span className="hidden md:inline">{current?.label ?? preset}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuGroup>
          <DropdownMenuLabel>主题样式</DropdownMenuLabel>
          {presets.map((option) => (
            <DropdownMenuItem key={option.id} onClick={() => setPreset(option.id)}>
              {option.label}
              {option.id === preset ? <Check className="ml-auto" /> : null}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
