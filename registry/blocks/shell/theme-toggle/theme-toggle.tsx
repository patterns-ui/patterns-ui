import { type ThemeMode, useTheme } from "@patterns-ui/core/theme";
import { Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";

const cycle: ThemeMode[] = ["light", "dark", "system"];

const icons: Record<ThemeMode, typeof Sun> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

const labels: Record<ThemeMode, string> = {
  light: "亮色",
  dark: "暗色",
  system: "跟随系统",
};

/** 明暗切换按钮：light → dark → system 循环 */
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const next = cycle[(cycle.indexOf(theme) + 1) % cycle.length] ?? "dark";
  const Icon = icons[theme] ?? Moon;

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={`切换主题（当前：${labels[theme]}）`}
      title={`主题：${labels[theme]}`}
      onClick={() => setTheme(next)}
    >
      <Icon />
    </Button>
  );
}
