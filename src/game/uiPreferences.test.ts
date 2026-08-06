import { describe, expect, it } from "vitest";
import {
  readSettingsCategoryPreference,
  readConnectionPointSize,
  readShowRunLogPreference,
  readShowItemHoverPreference,
  readSpeedrunPanelCollapsedPreference,
  readThemePreference,
  writeSettingsCategoryPreference,
  writeShowRunLogPreference,
  writeShowItemHoverPreference,
  writeSpeedrunPanelCollapsedPreference,
  writeThemePreference,
  writeConnectionPointSize,
} from "./uiPreferences";

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => values.delete(key),
    setItem: (key, value) => values.set(key, String(value)),
  } as Storage;
}

describe("device-only UI preferences", () => {
  it("keeps theme, run-log and category values independent from game state", () => {
    const storage = memoryStorage();
    const original = globalThis.window;
    Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage, matchMedia: () => ({ matches: false }) } });
    try {
      expect(readThemePreference()).toBeNull();
      expect(readShowRunLogPreference()).toBe(true);
      expect(readShowItemHoverPreference()).toBe(true);
      expect(readSettingsCategoryPreference()).toBe("all");
      expect(readConnectionPointSize()).toBe("default");
      expect(readSpeedrunPanelCollapsedPreference()).toBe(false);
      writeThemePreference("light");
      writeShowRunLogPreference(false);
      writeShowItemHoverPreference(false);
      writeSettingsCategoryPreference("statistics");
      writeConnectionPointSize("large50");
      writeSpeedrunPanelCollapsedPreference(true);
      expect(readThemePreference()).toBe("light");
      expect(readShowRunLogPreference()).toBe(false);
      expect(readShowItemHoverPreference()).toBe(false);
      expect(readSettingsCategoryPreference()).toBe("statistics");
      expect(readConnectionPointSize()).toBe("large50");
      expect(readSpeedrunPanelCollapsedPreference()).toBe(true);
    } finally {
      Object.defineProperty(globalThis, "window", { configurable: true, value: original });
    }
  });

  it("falls back safely when a stored value is invalid", () => {
    const storage = memoryStorage();
    storage.setItem("dsp-idle-network.ui.theme.v1", "neon");
    storage.setItem("dsp-idle-network.ui.show-run-log.v1", "maybe");
    storage.setItem("dsp-idle-network.ui.show-item-hover.v1", "maybe");
    storage.setItem("dsp-idle-network.ui.settings-category.v1", "unknown");
    storage.setItem("dsp-idle-network.ui.connection-point-size.v1", "huge");
    storage.setItem("dsp-idle-network.ui.speedrun-panel-collapsed.v1", "maybe");
    const original = globalThis.window;
    Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage, matchMedia: () => ({ matches: false }) } });
    try {
      expect(readThemePreference()).toBeNull();
      expect(readShowRunLogPreference()).toBe(true);
      expect(readShowItemHoverPreference()).toBe(true);
      expect(readSettingsCategoryPreference()).toBe("all");
      expect(readConnectionPointSize()).toBe("default");
      expect(readSpeedrunPanelCollapsedPreference()).toBe(false);
    } finally {
      Object.defineProperty(globalThis, "window", { configurable: true, value: original });
    }
  });
});
