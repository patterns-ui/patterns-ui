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
import { useMounted } from "../mounted";

export { useMounted };

export const THEME_STORAGE_KEY = "fc:theme";
export const PRESET_STORAGE_KEY = "fc:preset";
export const DEFAULT_THEME = "dark";
export const DEFAULT_PRESET = "default";

export type ThemeMode = "light" | "dark" | "system";

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

/**
 * 防闪（FOUC）内联脚本：放在 index.html `<head>` 首部，首帧绘制前读取
 * localStorage 设置 `data-theme`（system 经 matchMedia 解析）与 `data-preset`。
 * 与 ThemeProvider 的行为保持一致（同步默认值见 DEFAULT_THEME / DEFAULT_PRESET）。
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
    `var p=localStorage.getItem(${pk})||${dp};`,
    "var d=document.documentElement;",
    'd.setAttribute("data-theme",t);d.setAttribute("data-preset",p);d.style.colorScheme=t;',
    "}catch(e){}})();",
  ].join("");
}

/** 读当前 preset（无存储 / 无浏览器环境时回落 defaultPreset）；浏览器 API 已 try/catch 收敛 */
export function readPreset(defaultPreset: string = DEFAULT_PRESET): string {
  try {
    return globalThis.localStorage?.getItem(PRESET_STORAGE_KEY) || defaultPreset;
  } catch {
    return defaultPreset;
  }
}

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
    try {
      globalThis.localStorage?.setItem(PRESET_STORAGE_KEY, id);
    } catch {
      /* 隐私模式等场景静默降级 */
    }
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
