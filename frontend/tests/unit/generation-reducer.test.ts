import { describe, expect, it } from "vitest";
import { reduceGeneration } from "@application/generation/reducer";
import {
  initialGenerationState,
  type GenerationEventModel,
} from "@application/shared/models";

const start = (): GenerationEventModel => ({
  kind: "started",
  seq: 1,
  streamId: "stream",
  runId: "run",
  snapshot: {
    configurationRevision: "rev",
    effectivePlan: { code: "pro", origin: "base" },
    contentService: {
      nativeValidation: true,
      contentReviewEnabled: true,
      contentRepairLimit: 2,
    },
    nativeCorrectionPolicy: {
      version: "m003-native-policy-v1",
      scope: "logical_request",
      maxCalls: 2,
      editable: false,
    },
  },
});
const base = () => ({
  ...initialGenerationState(),
  phase: "streaming" as const,
  requestedEntries: ["learn"],
  requestedMeaningLanguage: "en" as const,
});

describe("M003 v6 generation reducer", () => {
  it("retains Plan and applies Unicode code-point splice across draft changes", () => {
    let state = reduceGeneration(base(), start());
    state = reduceGeneration(state, {
      kind: "progress",
      seq: 2,
      phase: "planning",
    });
    state = reduceGeneration(state, {
      kind: "plan_item",
      seq: 3,
      planId: "plan",
      meaningLanguage: "en",
      item: {
        kind: "word_use",
        entry: "learn",
        form: "learn",
        sense: "gain knowledge",
        phrase: "learn together",
      },
    });
    state = reduceGeneration(state, {
      kind: "progress",
      seq: 4,
      phase: "composing",
    });
    state = reduceGeneration(state, {
      kind: "draft",
      seq: 5,
      action: "begin",
      draftId: "d1",
      contentVersion: 1,
      baseRev: 0,
      mode: "initial",
    });
    state = reduceGeneration(state, {
      kind: "edit",
      seq: 6,
      draftId: "d1",
      contentVersion: 1,
      baseRev: 0,
      rev: 1,
      at: 0,
      deleteCount: 0,
      insert: "A🌱B",
      source: "provider",
    });
    state = reduceGeneration(state, {
      kind: "draft",
      seq: 7,
      action: "body_complete",
      draftId: "d1",
      contentVersion: 1,
      baseRev: 1,
      bodyLength: 3,
      paragraphCount: 1,
    });
    state = reduceGeneration(state, {
      kind: "draft",
      seq: 8,
      action: "begin",
      draftId: "d2",
      contentVersion: 2,
      baseRev: 1,
      mode: "replace",
    });
    state = reduceGeneration(state, {
      kind: "edit",
      seq: 9,
      draftId: "d2",
      contentVersion: 2,
      baseRev: 1,
      rev: 2,
      at: 2,
      deleteCount: 1,
      insert: "C",
      source: "provider",
    });
    state = reduceGeneration(state, {
      kind: "draft",
      seq: 10,
      action: "body_complete",
      draftId: "d2",
      contentVersion: 2,
      baseRev: 2,
      bodyLength: 3,
      paragraphCount: 1,
    });
    expect(state.streamedText).toBe("A🌱C");
    expect(state.codePointLength).toBe(3);
    expect(state.planItems).toHaveLength(1);
  });

  it("accepts an adjacent exact duplicate as NOOP and rejects a changed duplicate", () => {
    const started = reduceGeneration(base(), start());
    expect(reduceGeneration(started, start())).toBe(started);
    const invalid = reduceGeneration(started, {
      ...start(),
      streamId: "other",
    });
    expect(invalid.phase).toBe("pending");
    expect(invalid.failure?.kind).toBe("contract_violation");
  });

  it("allows retained rollback while keeping global revision and validates the final package", () => {
    let state = reduceGeneration(base(), start());
    state = reduceGeneration(state, {
      kind: "progress",
      seq: 2,
      phase: "planning",
    });
    state = reduceGeneration(state, {
      kind: "progress",
      seq: 3,
      phase: "composing",
    });
    state = reduceGeneration(state, {
      kind: "draft",
      seq: 4,
      action: "begin",
      draftId: "d1",
      contentVersion: 1,
      baseRev: 0,
      mode: "initial",
    });
    state = reduceGeneration(state, {
      kind: "edit",
      seq: 5,
      draftId: "d1",
      contentVersion: 1,
      baseRev: 0,
      rev: 1,
      at: 0,
      deleteCount: 0,
      insert: "We learn.",
      source: "provider",
    });
    state = reduceGeneration(state, {
      kind: "draft",
      seq: 6,
      action: "body_complete",
      draftId: "d1",
      contentVersion: 1,
      baseRev: 1,
      bodyLength: 9,
      paragraphCount: 1,
    });
    state = reduceGeneration(state, {
      kind: "draft",
      seq: 7,
      action: "begin",
      draftId: "d4",
      contentVersion: 4,
      baseRev: 1,
      mode: "replace",
    });
    state = reduceGeneration(state, {
      kind: "edit",
      seq: 8,
      draftId: "d4",
      contentVersion: 4,
      baseRev: 1,
      rev: 2,
      at: 3,
      deleteCount: 6,
      insert: "wander",
      source: "provider",
    });
    state = reduceGeneration(state, {
      kind: "draft",
      seq: 9,
      action: "body_complete",
      draftId: "d4",
      contentVersion: 4,
      baseRev: 2,
      bodyLength: 9,
      paragraphCount: 1,
    });
    state = reduceGeneration(state, {
      kind: "draft",
      seq: 10,
      action: "discard",
      draftId: "d4",
      contentVersion: 4,
      baseRev: 2,
    });
    state = reduceGeneration(state, {
      kind: "draft",
      seq: 11,
      action: "begin",
      draftId: "d3",
      contentVersion: 3,
      baseRev: 2,
      mode: "restore",
    });
    state = reduceGeneration(state, {
      kind: "edit",
      seq: 12,
      draftId: "d3",
      contentVersion: 3,
      baseRev: 2,
      rev: 3,
      at: 0,
      deleteCount: 9,
      insert: "We learn.",
      source: "retained",
    });
    state = reduceGeneration(state, {
      kind: "draft",
      seq: 13,
      action: "body_complete",
      draftId: "d3",
      contentVersion: 3,
      baseRev: 3,
      bodyLength: 9,
      paragraphCount: 1,
    });
    state = reduceGeneration(state, {
      kind: "progress",
      seq: 14,
      phase: "finalizing",
    });
    state = reduceGeneration(state, {
      kind: "validated",
      seq: 15,
      runId: "run",
      finalContentVersion: 3,
      result: {
        passage: "We learn.",
        passageSegments: [{ kind: "text", text: "We learn." }],
        tags: ["study"],
        targets: [
          {
            entry: "learn",
            entryMeaning: "gain knowledge",
            hintPhrase: "learn",
            hintSegments: [{ kind: "text", text: "learn" }],
          },
        ],
      },
      contentOutcome: "service_incomplete",
      completionNotice: "content_review_incomplete",
    });
    expect(state).toMatchObject({
      phase: "valid",
      revision: 0,
      finalContentVersion: 3,
      completionNotice: "content_review_incomplete",
      canSave: true,
    });
    expect(state.planItems).toEqual([]);
  });
});
