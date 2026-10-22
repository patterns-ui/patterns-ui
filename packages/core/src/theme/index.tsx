/**
 * core/theme —— 主题（docs/core-api.md §14）。
 *
 * next-themes 薄封装：attribute="data-theme"、默认 dark（暗色优先）；
 * 另自管 `data-preset` 属性（localStorage 'fc:preset'）实现主题 preset 切换。
 * preset 的 CSS（`[data-preset="x"] { --primary: ... }`）由 registry theme item 分发，core 不含样式。
 */
import { ThemeProvider as NextThemesProvider, useTheme as useNextTheme } from "next-themes";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { z } from "zod";
import { useMounted } from "../mounted";
import { createStorage } from "../storage";

export { useMounted };

export const THEME_STORAGE_KEY = "fc:theme";
export const PRESET_STORAGE_KEY = "fc:preset";
export const DEFAULT_THEME = "dark";
export const DEFAULT_PRESET = "default";

export type ThemeMode = "light" | "dark" | "system";

/**
 * 防闪（FOUC）内联脚本：放在 index.html `<head>` 首部，首帧绘制前读取
 * localStorage 设置 `data-theme`（system 经 matchMedia 解析）与 `data-preset`。
 * 与 ThemeProvider 的行为保持一致（同步默认值见 DEFAULT_THEME / DEFAULT_PRESET）。
 *
 * M6-B 三处同步（paradigm.md §5-B key 同步）：本生成器 ↔ apps/demo/index.html 内联镜像
 * ↔ demo guards G6 事实比对（key/默认值/DOM 属性/信封解析）。preset 经 createStorage
 * 持久化（`{v,d}` 信封），脚本读取时兼容裸字符串（旧数据）与信封两种形态。
 */
export function themeBlockingScript(
  storageKey: string = THEME_STORAGE_KEY,
  presetKey: string = PRESET_STORAGE_KEY,
): string {
  const sk = JSON.stringify(storageKey);
  const pk = JSON.stringify(presetKey);
  const dt = JSON.stringify(DEFAULT_THEME);
  const dp = JSON.stringify(DEFAULT_PRESET);
  return [
    "(function(){try{",
    `var t=localStorage.getItem(${sk})||${dt};`,
    'if(t==="system"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}',
    `var p=localStorage.getItem(${pk});`,
    // createStorage 信封 {v,d} 解包（旧裸字符串格式兼容：解析失败/非信封原样保留）
    'try{var o=JSON.parse(p);if(o&&typeof o.d==="string"){p=o.d}}catch(e){}',
    `p=p||${dp};`,
    "var d=document.documentElement;",
    'd.setAttribute("data-theme",t);d.setAttribute("data-preset",p);d.style.colorScheme=t;',
    "}catch(e){}})();",
  ].join("");
}

/** preset 存储（createStorage 单源；信封前裸字符串经 migrate 无损沿用） */
const presetStorage = createStorage(PRESET_STORAGE_KEY, z.string(), {
  version: 1,
  // 信封前格式 = 裸字符串 "default" 等（未经 JSON 序列化）：原样沿用
  migrate: (raw) => raw,
});

/** 读当前 preset（无存储 / 无浏览器环境时回落 defaultPreset）；浏览器 API 已 try/catch 收敛 */
export function readPreset(defaultPreset: string = DEFAULT_PRESET): string {
  return presetStorage.read() ?? defaultPreset;
}

export interface ThemeProviderProps {
  /** 默认 'dark'（视觉基线：暗色优先，architecture.md §8） */
  defaultTheme?: ThemeMode;
  /** next-themes 的 localStorage key，默认 'fc:theme' */
  storageKey?: string;
  /** 默认 preset id，默认 'default' */
  defaultPreset?: string;
  children: ReactNode;
}

interface PresetContextValue {
  preset: string;
  setPreset: (id: string) => void;
}

const PresetContext = createContext<PresetContextValue | null>(null);

export function ThemeProvider({
  children,
  defaultTheme = DEFAULT_THEME,
  storageKey = THEME_STORAGE_KEY,
  defaultPreset = DEFAULT_PRESET,
}: ThemeProviderProps) {
  const [preset, setPresetState] = useState(defaultPreset);

  // 挂载后从 localStorage 恢复 preset（读取收敛在 effect 内）
  useEffect(() => {
    setPresetState(readPreset(defaultPreset));
  }, [defaultPreset]);

  const setPreset = useCallback((id: string) => {
    setPresetState(id);
    presetStorage.write(id);
  }, []);

  // 属性写入收敛在 effect 内；首次挂载与阻塞脚本写入的值幂等
  useEffect(() => {
    document.documentElement.setAttribute("data-preset", preset);
  }, [preset]);

  const value = useMemo(() => ({ preset, setPreset }), [preset, setPreset]);

  return (
    <NextThemesProvider
      attribute="data-theme"
      defaultTheme={defaultTheme}
      storageKey={storageKey}
      enableColorScheme
    >
      <PresetContext.Provider value={value}>{children}</PresetContext.Provider>
    </NextThemesProvider>
  );
}

export function useTheme(): {
  theme: ThemeMode;
  setTheme: (t: ThemeMode) => void;
  preset: string;
  setPreset: (id: string) => void;
} {
  const next = useNextTheme();
  const ctx = useContext(PresetContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider (@patterns-ui/core/theme)");
  }
  return {
    theme: (next.theme ?? DEFAULT_THEME) as ThemeMode,
    setTheme: next.setTheme,
    preset: ctx.preset,
    setPreset: ctx.setPreset,
  };
}
