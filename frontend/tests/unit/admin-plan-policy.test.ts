import { describe, expect, it } from "vitest";
import {
  getPlanGenerationState,
  type AdminPlanDraft,
} from "@application/admin/plan-policy";
import { presentAdminPlanWarning } from "@presentation/admin/admin-plan-presenter";
import en from "../../i18n/locales/en-US.json";
import zh from "../../i18n/locales/zh-CN.json";

const draft = (overrides: Partial<AdminPlanDraft> = {}): AdminPlanDraft => ({
  rolling24hLimit: "5",
  maxEntries: 5,
  modelIds: ["model-safe"],
  allowedLengths: ["short"],
  ...overrides,
});

describe("CR036 plan configuration warning", () => {
  it.each(["5", "1", "1000", "", 5])("keeps available quota %s", (limit) => {
    expect(getPlanGenerationState(draft({ rolling24hLimit: limit }))).toBe(
      "available",
    );
  });
  it.each([
    { modelIds: [] },
    { allowedLengths: [] },
    { modelIds: [], allowedLengths: [] },
    { modelIds: [], allowedLengths: [], rolling24hLimit: "0" },
  ])("warns for missing selections %j", (overrides) => {
    expect(getPlanGenerationState(draft(overrides))).toBe("missing-options");
  });
  it("distinguishes zero from Unlimited without mutating the draft", () => {
    const input = draft({ rolling24hLimit: "0" });
    const before = structuredClone(input);
    expect(getPlanGenerationState(input)).toBe("zero-quota");
    expect(getPlanGenerationState(draft({ rolling24hLimit: 0 }))).toBe(
      "zero-quota",
    );
    expect(input).toEqual(before);
    expect(getPlanGenerationState({ ...input, rolling24hLimit: "" })).toBe(
      "available",
    );
  });
  it("does not coerce an invalid draft into zero quota", () => {
    for (const limit of ["-1", "invalid", " "])
      expect(
        getPlanGenerationState(draft({ rolling24hLimit: limit })),
      ).not.toBe("zero-quota");
  });
  for (const [locale, messages] of [
    ["en-US", en],
    ["zh-CN", zh],
  ] as const) {
    const t = (key: string) =>
      messages.admin[key.replace("admin.", "") as keyof typeof messages.admin];
    it(`presents approved ${locale} copy and no misleading zero-only hint`, () => {
      expect(presentAdminPlanWarning(draft({ modelIds: [] }), t)).toEqual({
        title: messages.admin.planPaused,
        copy: messages.admin.planResumeOptions,
      });
      expect(
        presentAdminPlanWarning(draft({ rolling24hLimit: "0" }), t),
      ).toEqual({
        title: messages.admin.planPaused,
        copy: "",
      });
      expect(presentAdminPlanWarning(draft(), t)).toBeNull();
      expect(presentAdminPlanWarning(undefined, t)).toBeNull();
    });
  }
  it("recomputes after draft change and persisted reload", () => {
    const input = draft();
    const t = (key: string) => key;
    expect(presentAdminPlanWarning(input, t)).toBeNull();
    input.modelIds = [];
    expect(presentAdminPlanWarning(input, t)?.title).toBe("admin.planPaused");
    expect(presentAdminPlanWarning(structuredClone(input), t)).toEqual(
      presentAdminPlanWarning(input, t),
    );
    input.modelIds.push("model-safe");
    expect(presentAdminPlanWarning(input, t)).toBeNull();
  });
});
