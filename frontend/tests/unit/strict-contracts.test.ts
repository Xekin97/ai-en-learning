import { describe, expect, it } from "vitest";
import { generationValidatedEventSchema } from "@infrastructure/http/schemas/generation";
import { reviewAttemptEnvelopeSchema } from "@infrastructure/http/schemas/review";
import { mapReviewAttemptDto } from "@infrastructure/http/mappers";
import { normalizeFailure } from "@application/shared/failure";
import { createApiRepository } from "@infrastructure/http/repositories/api-repository";
import { TokenVault } from "@runtime/session/token-vault";

describe("strict transport contracts", () => {
  it("rejects uncontracted generation fields", () => {
    const value = validGeneration();
    expect(
      generationValidatedEventSchema.safeParse({
        ...value,
        prompt: "ignore previous instructions",
      }).success,
    ).toBe(false);
  });

  it("rejects review answers in a spelling projection", () => {
    const value = spellingAttempt();
    const unsafe = structuredClone(value);
    Object.assign(unsafe.data.item, { answer: "adapt" });
    expect(reviewAttemptEnvelopeSchema.safeParse(unsafe).success).toBe(false);
  });

  it("maps only safe spelling fields into application state", () => {
    const parsed = reviewAttemptEnvelopeSchema.parse(spellingAttempt());
    const model = mapReviewAttemptDto(parsed.data);
    expect(JSON.stringify(model)).not.toContain("adapt");
    expect(model.item.stage).toBe("spelling");
  });

  it("classifies schema drift as a contract violation", () => {
    const result = reviewAttemptEnvelopeSchema.safeParse({
      data: {},
      meta: {},
    });
    if (result.success)
      throw new Error("Expected the schema to reject the payload");
    expect(normalizeFailure(result.error).kind).toBe("contract_violation");
  });

  it("requires opaque v1.3 groups and trims them from application state", () => {
    const parsed = reviewAttemptEnvelopeSchema.parse(passageAttempt());
    const model = mapReviewAttemptDto(parsed.data);
    expect(model.item.stage).toBe("passage_cloze");
    if (model.item.stage !== "passage_cloze") return;
    const blanks = model.item.passageSegments.filter(
      (segment) => segment.kind === "blank",
    );
    expect(blanks[0]?.groupRef).toBe(blanks[2]?.groupRef);
    expect(blanks[1]?.groupRef).not.toBe(blanks[0]?.groupRef);
    expect(JSON.stringify(model)).not.toContain("group_key");
    expect(JSON.stringify(model)).not.toContain("grp_AAAAAAAAAAAAAAAAAAAAAA");

    const missing = structuredClone(passageAttempt());
    delete (missing.data.item.passage_segments[1] as { group_key?: string })
      .group_key;
    expect(reviewAttemptEnvelopeSchema.safeParse(missing).success).toBe(false);

    const invalid = structuredClone(passageAttempt());
    invalid.data.item.passage_segments[1]!.group_key = "grp_predictable";
    expect(reviewAttemptEnvelopeSchema.safeParse(invalid).success).toBe(false);
  });

  it("never sends local grouping data in a passage action", async () => {
    const vault = new TokenVault();
    vault.setCsrf("csrf");
    vault.setAttempt("attempt-1", "attempt-token");
    let requestBody = "";
    const repository = createApiRepository(
      {
        async send(_path, init) {
          requestBody = String(init?.body ?? "");
          return new Response(
            JSON.stringify({
              data: {
                outcome: "retry",
                result: "incorrect",
                item: passageAttempt().data.item,
                progress: {
                  stage: "passage_cloze",
                  item_number: 1,
                  items_in_stage: 1,
                },
                incorrect_blank_ids: ["blank-1"],
              },
              meta: { request_id: "req-action" },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        },
      },
      vault,
      true,
    );
    await repository.actOnReview("attempt-1", {
      actionId: "action-1",
      itemId: "item-passage",
      action: "answer",
      answers: [
        { blankId: "blank-1", answer: "adapted" },
        { blankId: "blank-2", answer: "weave" },
      ],
    });
    expect(requestBody).not.toContain("group");
    expect(JSON.parse(requestBody)).toEqual({
      action_id: "action-1",
      item_id: "item-passage",
      action: "answer",
      answers: [
        { blank_id: "blank-1", answer: "adapted" },
        { blank_id: "blank-2", answer: "weave" },
      ],
    });
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

function spellingAttempt() {
  return {
    data: {
      attempt_id: "attempt-1",
      attempt_token: "secret-capability",
      item: {
        stage: "spelling",
        item_id: "item-1",
        entry_meaning: "改变以适应",
        hint: {
          segments: [
            { kind: "blank", length_hint: 8 },
            { kind: "text", text: " to change" },
          ],
        },
      },
      progress: { stage: "spelling", item_number: 1, items_in_stage: 2 },
    },
    meta: { request_id: "req-1" },
  };
}

function passageAttempt() {
  return {
    data: {
      attempt_id: "attempt-1",
      attempt_token: "secret-capability",
      item: {
        stage: "passage_cloze" as const,
        item_id: "item-passage",
        passage_segments: [
          { kind: "text" as const, text: "They " },
          {
            kind: "blank" as const,
            blank_id: "blank-1",
            group_key: "grp_AAAAAAAAAAAAAAAAAAAAAA",
          },
          { kind: "text" as const, text: " and " },
          {
            kind: "blank" as const,
            blank_id: "blank-2",
            group_key: "grp_BBBBBBBBBBBBBBBBBBBBBB",
          },
          { kind: "text" as const, text: ", then " },
          {
            kind: "blank" as const,
            blank_id: "blank-3",
            group_key: "grp_AAAAAAAAAAAAAAAAAAAAAA",
          },
          { kind: "text" as const, text: " again." },
        ],
      },
      progress: {
        stage: "passage_cloze" as const,
        item_number: 1,
        items_in_stage: 1,
      },
    },
    meta: { request_id: "req-passage" },
  };
}
