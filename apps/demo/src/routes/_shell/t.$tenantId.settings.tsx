import {
  formatAbsolute,
  formatRelative,
  useDateTimePrefs,
  useNow,
} from "@fleetly/ui-component-core/datetime";
import { type ThemeMode, useTheme } from "@fleetly/ui-component-core/theme";
import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { RelativeTime } from "@/components/blocks/shared/relative-time/relative-time";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const THEME_OPTIONS: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "亮色" },
  { value: "dark", label: "暗色" },
  { value: "system", label: "跟随系统" },
];

const PRESET_OPTIONS = [
  { value: "default", label: "Default（近黑中性 + indigo）" },
  { value: "aurora", label: "Aurora（浅色为主 + teal）" },
];

/** Intl.supportedValuesOf('timeZone')（ES2022+；类型定义未覆盖，运行时特性检测） */
function timeZones(): string[] {
  const intl = Intl as typeof Intl & {
    supportedValuesOf?: (key: string) => string[];
  };
  return intl.supportedValuesOf?.("timeZone") ?? [];
}

function pickLabel(options: { value: string; label: string }[], value: string | undefined): string {
  return options.find((o) => o.value === value)?.label ?? value ?? "";
}

/**
 * 设置页雏形：外观（theme + preset）与时区偏好，即时生效。
 */
function SettingsPage() {
  const { prefs, setPrefs } = useDateTimePrefs();
  const { theme, setTheme, preset, setPreset } = useTheme();
  const zones = useMemo(timeZones, []);
  const now = useNow(30_000);

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-[22px] font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground text-[13px]">
          偏好属 localStorage（不进 URL）；完整三节设置页在 M4 settings-page block 提供。
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>外观</CardTitle>
          <CardDescription>主题与样式预设，刷新后保持。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label>主题</Label>
            <Select
              value={theme}
              onValueChange={(value) => {
                if (value !== null) setTheme(value as ThemeMode);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue>{pickLabel(THEME_OPTIONS, theme)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {THEME_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>样式预设</Label>
            <Select
              value={preset}
              onValueChange={(value) => {
                if (value !== null) setPreset(value);
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue>{pickLabel(PRESET_OPTIONS, preset)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {PRESET_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>时间与地区</CardTitle>
          <CardDescription>时区偏好影响全站时间显示（Intl 时区解析）。</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <div className="grid gap-2">
            <Label>时区</Label>
            <Select
              value={prefs.timeZone ?? ""}
              onValueChange={(value) => {
                if (value !== null) setPrefs({ timeZone: value || undefined });
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(value: string | null) => (value === "" || value === null ? "系统时区" : value)}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="">系统时区</SelectItem>
                {zones.map((zone) => (
                  <SelectItem key={zone} value={zone}>
                    {zone}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-muted-foreground text-[13px]">
            绝对格式示例：<span className="text-foreground">{formatAbsolute(now, prefs)}</span>
            <br />
            相对格式示例：
            <RelativeTime value={now - 5 * 60_000} className="text-foreground" />（
            {formatRelative(now - 5 * 60_000, now)}）
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export const Route = createFileRoute("/_shell/t/$tenantId/settings")({
  staticData: { title: "Settings" },
  component: SettingsPage,
});
