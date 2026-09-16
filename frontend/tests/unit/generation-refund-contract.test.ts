import { describe, expect, it } from "vitest";
import { generationFailedEventSchema } from "@infrastructure/http/schemas/generation";
import { createApiRepository } from "@infrastructure/http/repositories/api-repository";
import { TokenVault } from "@runtime/session/token-vault";
import { reduceGeneration } from "@application/generation/reducer";
import {
  initialGenerationState,
  type GenerationStateModel,
} from "@application/shared/models";

describe("CR-041 refund metadata does not change presentation", () => {
  it.each([
    "content_validation_failed",
    "provider_unavailable",
    "generation_failed",
  ])(
    "preserves the complete application state for %s through the real SSE decoder",
    async (code) => {
      const states: GenerationStateModel[] = [];
      for (const refunded of [true, false]) {
        const vault = new TokenVault();
        vault.setCsrf("synthetic-csrf");
        let state: GenerationStateModel = {
          ...initialGenerationState(),
          phase: "streaming",
          runId: "synthetic-run",
          streamedText: "Unvalidated partial text",
        };
        let events = 0;
        const repository = createApiRepository(
          {
            async send() {
              const data = {
                code,
                quota_refunded: refunded,
                retryable: true,
                request_id: "synthetic-request",
              };
              return new Response(
                `event: generation.started\ndata: ${JSON.stringify({ run_id: "synthetic-run", generation_token: "synthetic-capability" })}\n\nevent: generation.failed\ndata: ${JSON.stringify(data)}\n\n`,
                {
                  status: 200,
                  headers: { "content-type": "text/event-stream" },
                },
              );
            },
          },
          vault,
          true,
        );
        await repository.streamGeneration(
          {
            modelId: "synthetic-model",
            meaningLanguage: "en",
            scenario: "story",
            length: "short",
            entries: ["young"],
          },
          (event) => {
            events += 1;
            expect(["started", "failed"]).toContain(event.kind);
            if (event.kind === "failed")
              expect(event.quotaRefunded).toBe(refunded);
            state = reduceGeneration(state, event);
          },
          new AbortController().signal,
        );
        expect(events).toBe(2);
        expect(state.phase).toBe("failed");
        expect(state.result).toBeNull();
        expect(state.failure?.code).toBe(code);
        states.push(state);
      }
      expect(states[1]).toEqual(states[0]);
    },
  );

  it.each([null, undefined, "false", 0])(
    "still rejects non-boolean refund metadata: %s",
    (value) => {
      expect(
        generationFailedEventSchema.safeParse({
          code: "content_validation_failed",
          quota_refunded: value,
          retryable: true,
          request_id: "synthetic-request",
        }).success,
      ).toBe(false);
    },
  );
});
