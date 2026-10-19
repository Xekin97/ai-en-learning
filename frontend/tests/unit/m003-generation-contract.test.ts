import { describe, expect, it } from "vitest";
import {
  generationEditEventSchema,
  generationFailedEventSchema,
  planPreviewItemSchema,
  randomEntryEnvelopeSchema,
  vocabularyEnvelopeSchema,
} from "@infrastructure/http/schemas/generation";
import { problemFromResponse } from "@infrastructure/http/repositories/repository-support";
import { mapVocabularyDto } from "@infrastructure/http/mappers";

describe("M003 generation wire boundaries", () => {
  it("maps API004 candidates verbatim and accepts the no-candidates union", () => {
    const vocabulary = vocabularyEnvelopeSchema.parse({
      data: {
        items: [{ entry: "theater" }, { entry: "another" }],
        vocabulary_version: "candidate-policy-v1",
      },
      meta: { request_id: "candidate-request" },
    });
    expect(mapVocabularyDto(vocabulary.data)).toEqual({
      entries: ["theater", "another"],
      vocabularyVersion: "candidate-policy-v1",
    });
    expect(
      randomEntryEnvelopeSchema.parse({
        data: { entry: null, reason: "no_candidates" },
        meta: { request_id: "random-request" },
      }).data,
    ).toEqual({ entry: null, reason: "no_candidates" });
  });

  it("counts Plan limits in Unicode code points", () => {
    expect(
      planPreviewItemSchema.safeParse({ kind: "scene", text: "🙂".repeat(600) })
        .success,
    ).toBe(true);
    expect(
      planPreviewItemSchema.safeParse({ kind: "scene", text: "🙂".repeat(601) })
        .success,
    ).toBe(false);
    expect(
      planPreviewItemSchema.safeParse({
        kind: "word_use",
        entry: "learn",
        form: "🙂".repeat(128),
        sense: "🙂".repeat(256),
        phrase: "🙂".repeat(256),
      }).success,
    ).toBe(true);
  });

  it("bounds every provider and retained insert at 2048 code points", () => {
    const edit = {
      seq: 4,
      draft_id: "draft",
      content_version: 1,
      base_rev: 0,
      rev: 1,
      at: 0,
      delete_count: 0,
      source: "provider" as const,
    };
    expect(
      generationEditEventSchema.safeParse({
        ...edit,
        insert: "🙂".repeat(2_048),
      }).success,
    ).toBe(true);
    expect(
      generationEditEventSchema.safeParse({
        ...edit,
        insert: "🙂".repeat(2_049),
      }).success,
    ).toBe(false);
    expect(
      generationEditEventSchema.safeParse({
        ...edit,
        source: "retained",
        insert: "🙂".repeat(2_049),
      }).success,
    ).toBe(false);
  });

  it("accepts only the failure code whitelist with a confirmed refund", () => {
    const failed = {
      seq: 8,
      code: "provider_unavailable",
      quota_refunded: true,
      retryable: true,
      request_id: "request",
    };
    expect(generationFailedEventSchema.safeParse(failed).success).toBe(true);
    expect(
      generationFailedEventSchema.safeParse({
        ...failed,
        code: "private_error",
      }).success,
    ).toBe(false);
    expect(
      generationFailedEventSchema.safeParse({
        ...failed,
        quota_refunded: false,
      }).success,
    ).toBe(false);
  });

  it("requires the transport and Problem statuses to both be 503 for busy", async () => {
    const body = {
      type: "about:blank",
      title: "Busy",
      status: 503,
      code: "generation_busy",
      detail: "busy",
      request_id: "request",
      context: { accepted: false, retry_after_seconds: 5 },
    };
    const mismatch = await problemFromResponse(
      new Response(JSON.stringify(body), {
        status: 429,
        headers: {
          "content-type": "application/problem+json",
          "retry-after": "5",
        },
      }),
    );
    expect(mismatch).toMatchObject({ kind: "contract_violation" });

    const busy = await problemFromResponse(
      new Response(JSON.stringify(body), {
        status: 503,
        headers: {
          "content-type": "application/problem+json",
          "retry-after": "5",
        },
      }),
    );
    expect(busy).toMatchObject({
      code: "generation_busy",
      accepted: false,
      retryAfterSeconds: 5,
    });
  });
});
