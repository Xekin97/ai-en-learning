import { describe, expect, it } from "vitest";

import enUS from "../../i18n/locales/en-US.json";
import zhCN from "../../i18n/locales/zh-CN.json";

describe("approved admin copy", () => {
  it("pins the PAGE-101 and PAGE-102 English labels to the approved prototype", () => {
    expect(enUS.admin.system).toBe("System");
    expect(enUS.admin.limit).toBe("Creations per 24 hours");
  });

  it("pins PAGE-103 search failure guidance to the approved bilingual copy", () => {
    expect(enUS.admin.searchErrorCopy).toBe("Please try again in a moment.");
    expect(zhCN.admin.searchErrorCopy).toBe("请稍后再试。");
  });
});
