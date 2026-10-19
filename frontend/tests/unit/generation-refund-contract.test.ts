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
      for (const refunded of [true]) {
        const vault = new TokenVault();
        vault.setCsrf("synthetic-csrf");
        let state: GenerationStateModel = {
          ...initialGenerationState(),
          phase: "streaming",
        };
        let events = 0;
        const repository = createApiRepository(
          {
            async send() {
              const data = {
                seq: 2,
                code,
                quota_refunded: refunded,
                retryable: true,
                request_id: "synthetic-request",
              };
              return new Response(
                `event: generation.started\ndata: ${JSON.stringify({ seq: 1, contract_version: "m003-stream-v6", stream_id: "stream", run_id: "synthetic-run", generation_token: "synthetic-capability", snapshot: { configuration_revision: "rev", effective_plan: { code: "basic", origin: "base" }, content_service: { native_validation: true, content_review_enabled: false, content_repair_limit: 0 }, native_correction_policy: { version: "m003-native-policy-v1", scope: "logical_request", max_calls: 2, editable: false } } })}\n\nevent: generation.failed\ndata: ${JSON.stringify(data)}\n\n`,
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
      expect(states).toHaveLength(1);
    },
  );

  it.each([null, undefined, "false", 0])(
    "still rejects non-boolean refund metadata: %s",
    (value) => {
      expect(
        generationFailedEventSchema.safeParse({
          seq: 2,
          code: "content_validation_failed",
          quota_refunded: value,
          retryable: true,
          request_id: "synthetic-request",
        }).success,
      ).toBe(false);
    },
  );
});
