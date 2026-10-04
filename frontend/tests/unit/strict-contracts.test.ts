import { describe, expect, it } from "vitest";
import { generationValidatedEventSchema } from "@infrastructure/http/schemas/generation";
import {
  reviewAttemptEnvelopeSchema,
  reviewSubmitEnvelopeSchema,
} from "@infrastructure/http/schemas/review";
import { mapDraft } from "@infrastructure/http/mappers/review-mapper";
import { normalizeFailure } from "@application/shared/failure";
import { createApiRepository } from "@infrastructure/http/repositories/api-repository";
import { TokenVault } from "@runtime/session/token-vault";
import { draftDto, sessionDto } from "../fixtures/m002";
const envelope = () => ({
  data: { attempt: draftDto() },
  meta: { request_id: "req-1" },
});
describe("strict M002 transport contracts", () => {
  it("rejects uncontracted generation fields", () =>
    expect(
      generationValidatedEventSchema.safeParse({
        ...validGeneration(),
        prompt: "unsafe",
      }).success,
    ).toBe(false));
  it("rejects answers and original words in an editable question projection", () => {
    for (const key of ["answer", "entry", "surface", "offset"]) {
      const d = envelope();
      Object.assign(d.data.attempt.words[0]!, { [key]: "adapt" });
      expect(reviewAttemptEnvelopeSchema.safeParse(d).success).toBe(false);
    }
  });
  it("maps only safe question fields and removes the capability from application state", () => {
    const model = mapDraft(
      reviewAttemptEnvelopeSchema.parse(envelope()).data.attempt,
    );
    expect(JSON.stringify(model)).not.toMatch(
      /adapt|secret-capability|group_key|grp_A/,
    );
    expect(model.words[0]?.slots).toEqual([{ kind: "letters", count: 5 }]);
  });
  it("classifies schema drift as contract violation", () => {
    const result = reviewAttemptEnvelopeSchema.safeParse({
      data: {},
      meta: {},
    });
    expect(result.success).toBe(false);
    if (!result.success)
      expect(normalizeFailure(result.error).kind).toBe("contract_violation");
  });
  it("preserves anonymous same-source groups while rejecting missing/predictable raw groups", () => {
    const model = mapDraft(
      reviewAttemptEnvelopeSchema.parse(envelope()).data.attempt,
    );
    const blanks = model.passage.filter((s) => s.kind === "blank");
    expect(blanks[0]?.groupRef).toBe(blanks[2]?.groupRef);
    expect(blanks[1]?.groupRef).not.toBe(blanks[0]?.groupRef);
    for (const value of [undefined, "grp_predictable"]) {
      const d = envelope();
      Object.assign(d.data.attempt.passage.segments[1]!, { group_key: value });
      expect(reviewAttemptEnvelopeSchema.safeParse(d).success).toBe(false);
    }
  });
  it("sends only inputs and version, never grouping or a locally evaluated score", async () => {
    const vault = new TokenVault();
    vault.setCsrf("csrf");
    vault.setAttempt("attempt-1", "attempt-token");
    let body = "";
    const receipt = {
      attempt_id: "attempt-1",
      batch_id: "batch-1",
      revision: "rev-2",
      submitted_at: "2026-09-20T00:00:00Z",
      successful: false,
      has_answer: true,
    };
    const completed = {
      ...sessionDto(),
      status: "completed",
      current_batch: null,
      progress: {
        completed_batches: 1,
        total_batches: 1,
        successful_batches: 0,
        unsuccessful_batches: 1,
        skipped_batches: 0,
      },
    };
    const repository = createApiRepository(
      {
        async send(_path, init) {
          body = String(init?.body);
          return new Response(
            JSON.stringify({
              data: {
                outcome: "already_submitted",
                receipt,
                session: completed,
              },
              meta: { request_id: "req" },
            }),
            { headers: { "content-type": "application/json" } },
          );
        },
      },
      vault,
      true,
    );
    await repository.submitReviewAttempt("attempt-1", {
      expectedRevision: "rev-1",
      words: [{ questionId: "question-1", answer: "a" }],
      passage: [{ blankId: "blank-1", answer: "partial" }],
    });
    expect(JSON.parse(body)).toEqual({
      expected_revision: "rev-1",
      words: [{ question_id: "question-1", answer: "a" }],
      passage: [{ blank_id: "blank-1", answer: "partial" }],
    });
    expect(() => vault.attempt("attempt-1")).toThrow();
    expect(
      reviewSubmitEnvelopeSchema.safeParse({
        data: {
          outcome: "already_submitted",
          receipt,
          session: completed,
          comparison: {},
        },
        meta: { request_id: "req" },
      }).success,
    ).toBe(false);
  });
});

function validGeneration() {
  return {
    run_id: "run-1",
    result: {
      passage: "We adapt.",
      tags: ["growth"],
      targets: [
        {
          entry: "adapt",
          entry_meaning: "change to fit",
          hint_phrase: "adapt to change",
          hint_blanks: [{ start: 0, end: 5 }],
          occurrences: [{ start: 3, end: 8, surface: "adapt" }],
        },
      ],
    },
  };
}
