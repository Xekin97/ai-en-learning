import { describe, expect, it } from "vitest";
import { reduceGeneration } from "@application/generation/reducer";
import { initialGenerationState } from "@application/shared/models";

describe("generation reducer", () => {
  it("accepts stream events only in lifecycle order", () => {
    const idle = initialGenerationState();
    expect(reduceGeneration(idle, { kind: "delta", text: "leak" })).toEqual(
      idle,
    );
    const streaming = { ...idle, phase: "streaming" as const };
    const started = reduceGeneration(streaming, {
      kind: "started",
      runId: "run-1",
    });
    const delta = reduceGeneration(started, { kind: "delta", text: "A story" });
    expect(delta.runId).toBe("run-1");
    expect(delta.streamedText).toBe("A story");
  });

  it("does not append deltas after validation", () => {
    const valid = reduceGeneration(
      { ...initialGenerationState(), phase: "streaming", runId: "run-1" },
      {
        kind: "validated",
        runId: "run-1",
        result: {
          passage: "We adapt.",
          passageSegments: [{ kind: "text", text: "We adapt." }],
          tags: ["growth"],
          targets: [],
        },
      },
    );
    expect(reduceGeneration(valid, { kind: "delta", text: "ignored" })).toEqual(
      valid,
    );
  });
});
