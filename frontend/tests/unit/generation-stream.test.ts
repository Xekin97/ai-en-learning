import { describe, expect, it, vi } from "vitest";
import { createApiRepository } from "@infrastructure/http/repositories/api-repository";
import { TokenVault } from "@runtime/session/token-vault";
import { normalizeFailure } from "@application/shared/failure";
import { reduceGeneration } from "@application/generation/reducer";
import {
  initialGenerationState,
  type GenerationEventModel,
  type GenerationStateModel,
} from "@application/shared/models";
const input = {
  modelId: "model",
  meaningLanguage: "en",
  scenario: "story",
  length: "short",
  entries: ["learn"],
} as const;
const event = (name: string, data: unknown) =>
  `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
const started = event("generation.started", {
  seq: 1,
  contract_version: "m003-stream-v6",
  stream_id: "stream",
  run_id: "run",
  generation_token: "synthetic-capability",
  snapshot: {
    configuration_revision: "rev",
    effective_plan: { code: "basic", origin: "base" },
    content_service: {
      native_validation: true,
      content_review_enabled: false,
      content_repair_limit: 0,
    },
    native_correction_policy: {
      version: "m003-native-policy-v1",
      scope: "logical_request",
      max_calls: 2,
      editable: false,
    },
  },
});
const result = {
  seq: 8,
  run_id: "run",
  final_content_version: 1,
  result: {
    passage: "We learn. 🙂",
    tags: ["Study"],
    targets: [
      {
        entry: "learn",
        entry_meaning: "学习",
        hint_phrase: "learn more",
        hint_blanks: [{ start: 0, end: 5 }],
        occurrences: [{ start: 3, end: 8, surface: "learn" }],
      },
    ],
  },
  content_outcome: "basic",
  completion_notice: null,
};
const valid = event("generation.validated", result);
const planning = event("generation.progress", { seq: 2, phase: "planning" });
const composing = event("generation.progress", { seq: 3, phase: "composing" });
const draftBegin = event("generation.draft", {
  seq: 4,
  action: "begin",
  draft_id: "draft",
  content_version: 1,
  mode: "initial",
  base_rev: 0,
});
const editWire = event("generation.edit", {
  seq: 5,
  draft_id: "draft",
  content_version: 1,
  base_rev: 0,
  rev: 1,
  at: 0,
  delete_count: 0,
  insert: "We learn. 🙂",
  source: "provider",
});
const bodyComplete = event("generation.draft", {
  seq: 6,
  action: "body_complete",
  draft_id: "draft",
  content_version: 1,
  base_rev: 1,
  body_length: 11,
  paragraph_count: 1,
});
const finalizing = event("generation.progress", {
  seq: 7,
  phase: "finalizing",
});
const successful =
  started +
  planning +
  composing +
  draftBegin +
  editWire +
  bodyComplete +
  finalizing +
  valid;
const failed = event("generation.failed", {
  seq: 2,
  code: "content_validation_failed",
  quota_refunded: true,
  retryable: true,
  request_id: "request-stream",
});
const cancelled = event("generation.cancelled", {
  seq: 2,
  quota_refunded: false,
});
function harness(
  chunks: (string | Uint8Array)[],
  close = true,
  status = 200,
  contentType = "text/event-stream",
) {
  const cancel = vi.fn();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks)
        controller.enqueue(
          typeof chunk === "string" ? new TextEncoder().encode(chunk) : chunk,
        );
      if (close) controller.close();
    },
    cancel,
  });
  const vault = new TokenVault();
  vault.setCsrf("synthetic-csrf");
  const events: GenerationEventModel[] = [];
  let state: GenerationStateModel = {
    ...initialGenerationState(),
    phase: "streaming",
  };
  const send = vi.fn(
    async () =>
      new Response(stream, {
        status,
        headers: {
          "content-type": contentType,
          "x-request-id": "request-header",
        },
      }),
  );
  const repository = createApiRepository({ send }, vault, true);
  const controller = new AbortController();
  const consume = () =>
    repository.streamGeneration(
      { ...input, entries: [...input.entries] },
      (e) => {
        events.push(e);
        state = reduceGeneration(state, e);
      },
      controller.signal,
    );
  return {
    consume,
    controller,
    cancel,
    vault,
    events,
    send,
    state: () => state,
  };
}
describe("G14 real SSE decoder and mapping", () => {
  it.each([1, 2, 7, 128])(
    "handles UTF-8/network chunks of %i bytes and heartbeats",
    async (width) => {
      const bytes = new TextEncoder().encode(
        started +
          ": heartbeat\r\n\r\n" +
          planning +
          composing +
          draftBegin +
          editWire +
          bodyComplete +
          finalizing +
          valid,
      );
      const chunks = [];
      for (let i = 0; i < bytes.length; i += width)
        chunks.push(bytes.slice(i, i + width));
      const h = harness(chunks);
      await h.consume();
      expect(h.state()).toMatchObject({
        phase: "valid",
        runId: "run",
        streamedText: "We learn. 🙂",
      });
      expect(h.state().result?.targets[0]?.entryMeaning).toBe("学习");
      expect(JSON.stringify(h.state())).not.toMatch(
        /generation_token|synthetic-capability|hint_blanks|entry_meaning/,
      );
      expect(h.vault.generation("run")).toBe("synthetic-capability");
    },
  );
  it("retains a failed event request id as safe failure metadata", async () => {
    const h = harness([started, failed]);
    await h.consume();
    expect(h.state().failure).toMatchObject({
      requestId: "request-stream",
      code: "content_validation_failed",
      retryable: true,
    });
    expect(() => h.vault.generation("run")).toThrow();
  });
  it.each([
    ["edit before started", editWire],
    ["valid before started", valid],
    [
      "changed duplicate started",
      started + started.replace("synthetic-capability", "different-capability"),
    ],
    [
      "different run",
      started + event("generation.validated", { ...result, run_id: "other" }),
    ],
    ["unknown event", started + event("unknown", {})],
    ["malformed json", started + "event: generation.edit\ndata: {broken\n\n"],
    ["bad payload", started + event("generation.edit", { text: 5 })],
    [
      "invalid span",
      started +
        event("generation.validated", {
          ...result,
          result: {
            ...result.result,
            targets: [
              {
                ...result.result.targets[0],
                hint_blanks: [{ start: 9, end: 20 }],
              },
            ],
          },
        }),
    ],
    [
      "oversize event",
      started + "event: generation.edit\ndata: " + "x".repeat(33_554_433),
    ],
    ["invalid UTF8", new Uint8Array([0xff])],
  ] as const)(
    "rejects %s without a result or leaked raw error",
    async (_name, wire) => {
      const h = harness([wire], false);
      const error = await h.consume().then(
        () => null,
        (e) => e,
      );
      expect(normalizeFailure(error).kind).toBe("contract_violation");
      expect(h.state().result).toBeNull();
      expect(h.cancel).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(error)).not.toMatch(
        /synthetic-capability|broken|hint_blanks/,
      );
    },
  );
  it("accepts one adjacent byte-equivalent started retry without replacing the capability", async () => {
    const h = harness([
      started +
        started +
        planning +
        composing +
        draftBegin +
        editWire +
        bodyComplete +
        finalizing +
        valid,
    ]);
    await h.consume();
    expect(h.events.filter((item) => item.kind === "started")).toHaveLength(1);
    expect(h.vault.generation("run")).toBe("synthetic-capability");
    expect(h.state().phase).toBe("valid");
  });
  it.each([
    "",
    started,
    started + planning + composing + editWire,
    started + valid.trimEnd(),
  ])("rejects incomplete EOF (%#)", async (wire) => {
    const h = harness([wire]);
    await expect(h.consume()).rejects.toMatchObject({ kind: "network" });
    expect(h.state().result).toBeNull();
  });
  it.each([valid, failed, cancelled])(
    "settles immediately on the first terminal even if socket stays open (%#)",
    async (terminal) => {
      const h = harness(
        [terminal === valid ? successful : started + terminal],
        false,
      );
      await h.consume();
      expect(h.cancel).toHaveBeenCalledTimes(1);
    },
  );
  it("ignores trailing bytes after validated instead of downgrading it", async () => {
    const h = harness([successful + "event: unknown\ndata: {bad\n\n"]);
    await h.consume();
    expect(h.state().phase).toBe("valid");
    expect(h.events).toHaveLength(8);
  });
  it("aborts a silent body and releases its capability", async () => {
    const h = harness([started], false);
    const pending = h.consume();
    await vi.waitFor(() => expect(h.events).toHaveLength(1));
    h.controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(h.cancel).toHaveBeenCalledTimes(1);
    expect(h.vault.generation("run")).toBe("synthetic-capability");
  });
  it("does not issue a request with an already aborted signal", async () => {
    const h = harness([successful]);
    h.controller.abort();
    await expect(h.consume()).rejects.toMatchObject({ name: "AbortError" });
    expect(h.send).not.toHaveBeenCalled();
  });
  it("maps a preflight Problem without exposing its detail", async () => {
    const h = harness(
      [
        JSON.stringify({
          type: "about:blank",
          title: "Unavailable",
          status: 429,
          detail: "PRIVATE",
          code: "quota_exhausted",
          request_id: "preflight-request",
        }),
      ],
      true,
      429,
      "application/problem+json",
    );
    const error = await h.consume().catch((e) => e);
    expect(error).toMatchObject({
      kind: "quota_exhausted",
      requestId: "preflight-request",
      status: 429,
    });
    expect(JSON.stringify(error)).not.toContain("PRIVATE");
    expect(h.events).toEqual([]);
  });
  it("rejects a non-SSE success response and closes the body", async () => {
    const h = harness(["not an event"], false, 200, "application/json");
    await expect(h.consume()).rejects.toMatchObject({
      kind: "contract_violation",
    });
    expect(h.cancel).toHaveBeenCalledTimes(1);
  });
});
