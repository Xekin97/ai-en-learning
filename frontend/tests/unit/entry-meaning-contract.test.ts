import { draftDto } from "../fixtures/m002";
import { mapDraft } from "@infrastructure/http/mappers/review-mapper";
import { describe, expect, it } from "vitest";
import { entryMeaningSchema } from "@infrastructure/http/schemas/common";
import { generationValidatedEventSchema } from "@infrastructure/http/schemas/generation";
import { batchDetailSchema } from "@infrastructure/http/schemas/learning";
import { adminBatchDetailEnvelopeSchema } from "@infrastructure/http/schemas/admin";
import { reviewAttemptEnvelopeSchema } from "@infrastructure/http/schemas/review";
import {
  mapGenerationValidatedDto,
  mapBatchDetailDto,
} from "@infrastructure/http/mappers";
import { presentAdminBatchReader } from "@presentation/admin/admin-user-detail-presenter";
import { normalizeFailure } from "@application/shared/failure";

const meaning = "易受伤害的；脆弱的";
const target = {
  entry: "vulnerable",
  entry_meaning: meaning,
  hint_phrase: "vulnerable people",
  hint_blanks: [{ start: 0, end: 10 }],
  occurrences: [{ surface: "Vulnerability", start: 0, end: 13 }],
};
const generation = {
  run_id: "run-current",
  result: {
    passage: "Vulnerability matters.",
    tags: ["社区"],
    targets: [target],
  },
};
const batch = {
  id: "batch-current",
  title: "vulnerable",
  title_revision: "title-1",
  title_max_length: 200,
  saved_at: "2026-09-09T00:00:00Z",
  configuration: {
    model: { name: "Synthetic" },
    meaning_language: "zh",
    scenario: "story",
    length: "short",
  },
  participates_in_range_review: true,
  ...generation.result,
  review_summary: {
    completed_count: 0,
    successful_count: 0,
    last_completed_at: null,
  },
};
const meta = { request_id: "req-current" };
const spellingItem = { ...draftDto().words[0]!, entry_meaning: meaning };
const attempt = {
  data: { attempt: { ...draftDto(), words: [spellingItem] } },
  meta,
};

describe("CR-040 original-entry meaning", () => {
  it("counts Unicode code points and never normalizes a valid value", () => {
    for (const value of [
      meaning,
      "open to harm; easily injured",
      "傷つきやすい",
      "𠮷".repeat(500),
    ]) {
      expect(entryMeaningSchema.parse(value)).toBe(value);
    }
    for (const value of [
      null,
      5,
      "",
      " word",
      "word ",
      "\nword",
      "𠮷".repeat(501),
    ]) {
      expect(entryMeaningSchema.safeParse(value).success).toBe(false);
    }
  });

  it("maps generation, shared learner/admin detail, the complete editable spelling draft", () => {
    const generated = mapGenerationValidatedDto(
      generationValidatedEventSchema.parse(generation),
    );
    const detail = mapBatchDetailDto(batchDetailSchema.parse(batch));
    const admin = mapBatchDetailDto(
      adminBatchDetailEnvelopeSchema.parse({ data: { batch }, meta }).data
        .batch,
    );
    const first = mapDraft(
      reviewAttemptEnvelopeSchema.parse(attempt).data.attempt,
    );
    expect(generated.targets[0]?.entryMeaning).toBe(meaning);
    expect(detail.targets[0]?.entryMeaning).toBe(meaning);
    expect(admin).toEqual(detail);
    expect(first.words[0]?.entryMeaning).toBe(meaning);
    for (const state of [generated, detail, admin, first]) {
      const serialized = JSON.stringify(state);
      expect(serialized).not.toContain("entry_meaning");
      expect(serialized).not.toContain("contextual");
      expect(serialized).not.toContain("synthetic-private-token");
    }
    expect(generated.passage).toBe(generation.result.passage);
    expect(generated.targets[0]?.hintSegments).toEqual([
      { kind: "target", text: "vulnerable" },
      { kind: "text", text: " people" },
    ]);
  });

  it("does not change persisted meaning when UI locale changes", () => {
    const detail = mapBatchDetailDto(batchDetailSchema.parse(batch));
    for (const locale of ["zh-CN", "en-US"]) {
      const view = presentAdminBatchReader(
        { kind: "ready", userId: "user", batchId: detail.id, batch: detail },
        "learner",
        {
          t: (key) => locale + ":" + key,
          date: (value) => value,
          integer: String,
          group: String,
          meaning: String,
          scenario: String,
          length: String,
        },
      );
      expect(view.words[0]?.meaning).toBe(meaning);
      expect(view.language).toBe("zh-CN");
    }
  });

  it.each(["old", "dual", "missing", "null", "number", "alias"])(
    "rejects %s fields consistently in every public projection",
    (kind) => {
      const invalid: Record<string, unknown> = { entry_meaning: meaning };
      if (kind === "old" || kind === "dual")
        invalid.contextual_meaning = meaning;
      if (kind === "old" || kind === "missing") delete invalid.entry_meaning;
      if (kind === "null") invalid.entry_meaning = null;
      if (kind === "number") invalid.entry_meaning = 7;
      if (kind === "alias") {
        delete invalid.entry_meaning;
        invalid.Entry_Meaning = meaning;
      }
      const { entry_meaning: _targetMeaning, ...targetRest } = target;
      const { entry_meaning: _itemMeaning, ...itemRest } = spellingItem;
      const invalidTarget = { ...targetRest, ...invalid };
      const invalidItem = { ...itemRest, ...invalid };
      const checks = [
        generationValidatedEventSchema.safeParse({
          ...generation,
          result: { ...generation.result, targets: [invalidTarget] },
        }),
        batchDetailSchema.safeParse({ ...batch, targets: [invalidTarget] }),
        adminBatchDetailEnvelopeSchema.safeParse({
          data: { batch: { ...batch, targets: [invalidTarget] } },
          meta,
        }),
        reviewAttemptEnvelopeSchema.safeParse({
          ...attempt,
          data: { attempt: { ...attempt.data.attempt, words: [invalidItem] } },
        }),
      ];
      for (const result of checks) {
        expect(result.success).toBe(false);
        if (!result.success)
          expect(normalizeFailure(result.error).kind).toBe(
            "contract_violation",
          );
      }
    },
  );
});
