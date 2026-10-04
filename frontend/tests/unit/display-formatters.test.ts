import { afterEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useDisplayFormatters } from "../../app/composables/use-display-formatters";

afterEach(() => vi.unstubAllGlobals());

function setup(language = "en-US") {
  const locale = ref(language);
  vi.stubGlobal("useI18n", () => ({ locale, t: vi.fn() }));
  vi.stubGlobal("useDesignCopy", () => ({ copy: vi.fn() }));
  return { locale, format: useDisplayFormatters() };
}

describe("localized date and time display", () => {
  it.each([
    ["en-US", "2026-09-27T19:59:00Z", "Sep 28, 2026, 3:59 AM"],
    ["en-US", "2026-09-27T20:00:00Z", "Sep 28, 2026, 4:00 AM"],
    ["en-US", "2026-09-28T04:00:00Z", "Sep 28, 2026, 12:00 PM"],
    ["en-US", "2026-12-31T16:00:00Z", "Jan 1, 2027, 12:00 AM"],
    ["zh-CN", "2026-09-27T19:59:00Z", "2026年9月28日 03:59"],
    ["zh-CN", "2026-09-27T20:00:00Z", "2026年9月28日 04:00"],
    ["zh-CN", "2026-09-28T04:00:00Z", "2026年9月28日 12:00"],
    ["zh-CN", "2026-12-31T16:00:00Z", "2027年1月1日 00:00"],
  ])("uses Beijing time for %s at %s", (language, value, expected) => {
    expect(setup(language).format.dateTime(value)).toBe(expected);
  });

  it("reacts to the current language and preserves equivalent instants", () => {
    const { locale, format } = setup();
    const utc = "2026-09-28T06:46:00Z";
    const offset = "2026-09-28T14:46:00+08:00";
    expect(format.dateTime(utc)).toBe("Sep 28, 2026, 2:46 PM");
    expect(format.dateTime(offset)).toBe(format.dateTime(utc));
    locale.value = "zh-CN";
    expect(format.dateTime(utc)).toBe("2026年9月28日 14:46");
    expect(format.dateTime(offset)).toBe(format.dateTime(utc));
  });
});
