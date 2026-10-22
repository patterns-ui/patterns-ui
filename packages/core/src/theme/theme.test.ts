import { describe, expect, it } from "vitest";
import {
  DEFAULT_PRESET,
  DEFAULT_THEME,
  PRESET_STORAGE_KEY,
  THEME_STORAGE_KEY,
  themeBlockingScript,
} from "./index";

describe("themeBlockingScript", () => {
  it("reads default keys and applies data-theme/data-preset", () => {
    const script = themeBlockingScript();
    expect(script).toContain(`localStorage.getItem("${THEME_STORAGE_KEY}")`);
    expect(script).toContain(`localStorage.getItem("${PRESET_STORAGE_KEY}")`);
    expect(script).toContain(`"${DEFAULT_THEME}"`);
    expect(script).toContain(`"${DEFAULT_PRESET}"`);
    expect(script).toContain('setAttribute("data-theme",t)');
    expect(script).toContain('setAttribute("data-preset",p)');
    // system 主题要经 matchMedia 解析
    expect(script).toContain("matchMedia");
    // colorScheme 同步（滚动条/表单控件跟主题）
    expect(script).toContain("d.style.colorScheme=t");
    // preset 经 createStorage 信封持久化（M6-B）：脚本须解包 {v,d}（兼容旧裸字符串）
    expect(script).toContain("JSON.parse(p)");
    expect(script).toContain("p=o.d");
  });

  it("supports custom storage keys", () => {
    const script = themeBlockingScript("app:theme", "app:preset");
    expect(script).toContain(`localStorage.getItem("app:theme")`);
    expect(script).toContain(`localStorage.getItem("app:preset")`);
    expect(script).not.toContain(THEME_STORAGE_KEY);
  });

  it("is an immediately-invoked function tolerant to failures (try/catch)", () => {
    const script = themeBlockingScript();
    expect(script.startsWith("(function(){try{")).toBe(true);
    expect(script.endsWith("}catch(e){}})();")).toBe(true);
  });
});
