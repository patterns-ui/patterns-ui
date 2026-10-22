// @vitest-environment happy-dom
/**
 * ThemeProvider 组件级测试（docs/paradigm.md §5-B 任务7）：
 * preset 恢复（createStorage 信封 + 旧裸字符串迁移）、data-theme/data-preset 落 DOM、
 * setPreset 持久化（防闪脚本读取的同一存储）。
 */
import { act, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_THEME, PRESET_STORAGE_KEY, ThemeProvider, useTheme } from "./index";

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  document.documentElement.removeAttribute("data-preset");
});

interface ThemeProbeResult {
  theme: string;
  preset: string;
  setPreset: (id: string) => void;
}

function renderTheme(props?: Parameters<typeof ThemeProvider>[0]) {
  let probe: ThemeProbeResult | undefined;
  // biome-ignore lint/correctness/noComponentHookFactories: 测试探针组件（闭包捕获 hook 结果）
  function Probe() {
    const theme = useTheme();
    probe = { theme: theme.theme, preset: theme.preset, setPreset: theme.setPreset };
    return null;
  }
  render(
    <ThemeProvider {...props}>
      <Probe />
    </ThemeProvider>,
  );
  return () => probe as ThemeProbeResult;
}

describe("ThemeProvider", () => {
  it("preset 恢复：信封格式 {v,d} 挂载后生效并落 DOM data-preset", async () => {
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify({ v: 1, d: "midnight" }));
    const probe = renderTheme();

    await waitFor(() => expect(probe().preset).toBe("midnight"));
    await waitFor(() =>
      expect(document.documentElement.getAttribute("data-preset")).toBe("midnight"),
    );
  });

  it("preset 旧格式迁移：裸字符串无感沿用", async () => {
    localStorage.setItem(PRESET_STORAGE_KEY, "sunset"); // 信封前裸串
    const probe = renderTheme();

    await waitFor(() => expect(probe().preset).toBe("sunset"));
    await waitFor(() =>
      expect(document.documentElement.getAttribute("data-preset")).toBe("sunset"),
    );
  });

  it("无存储 → 缺省 preset=default 落 DOM；data-theme 落 DOM（next-themes）", async () => {
    const probe = renderTheme();

    await waitFor(() => expect(probe().preset).toBe("default"));
    await waitFor(() => {
      expect(document.documentElement.getAttribute("data-preset")).toBe("default");
      expect(document.documentElement.getAttribute("data-theme")).toBe(DEFAULT_THEME);
    });
  });

  it("setPreset：更新 DOM 属性并以信封格式持久化（防闪脚本读取同一存储）", async () => {
    const probe = renderTheme();
    await waitFor(() => expect(probe().preset).toBe("default"));

    act(() => {
      probe().setPreset("ocean");
    });
    expect(probe().preset).toBe("ocean");
    await waitFor(() => expect(document.documentElement.getAttribute("data-preset")).toBe("ocean"));
    expect(JSON.parse(localStorage.getItem(PRESET_STORAGE_KEY) ?? "{}")).toEqual({
      v: 1,
      d: "ocean",
    });
  });
});
