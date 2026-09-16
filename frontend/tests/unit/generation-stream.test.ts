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
  run_id: "run",
  generation_token: "synthetic-capability",
});
const result = {
  run_id: "run",
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
};
const valid = event("generation.validated", result);
const failed = event("generation.failed", {
  code: "content_validation_failed",
  quota_refunded: false,
  retryable: true,
  request_id: "request-stream",
});
const cancelled = event("generation.cancelled", { quota_refunded: false });
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
          event("passage.delta", { text: "We learn. 🙂" }) +
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
    ["delta before started", event("passage.delta", { text: "bad" })],
    ["valid before started", valid],
    ["duplicate started", started + started],
    [
      "different run",
      started + event("generation.validated", { ...result, run_id: "other" }),
    ],
    ["unknown event", started + event("unknown", {})],
    ["malformed json", started + "event: passage.delta\ndata: {broken\n\n"],
    ["bad payload", started + event("passage.delta", { text: 5 })],
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
      started + "event: passage.delta\ndata: " + "x".repeat(1_048_577),
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
      expect(() => h.vault.generation("run")).toThrow();
    },
  );
  it.each([
    "",
    started,
    started + event("passage.delta", { text: "partial" }),
    started + valid.trimEnd(),
  ])("rejects incomplete EOF (%#)", async (wire) => {
    const h = harness([wire]);
    await expect(h.consume()).rejects.toMatchObject({ kind: "network" });
    expect(h.state().result).toBeNull();
    expect(() => h.vault.generation("run")).toThrow();
  });
  it.each([valid, failed, cancelled])(
    "settles immediately on the first terminal even if socket stays open (%#)",
    async (terminal) => {
      const h = harness([started, terminal], false);
      await h.consume();
      expect(h.cancel).toHaveBeenCalledTimes(1);
    },
  );
  it("ignores trailing bytes after validated instead of downgrading it", async () => {
    const h = harness([started + valid + "event: unknown\ndata: {bad\n\n"]);
    await h.consume();
    expect(h.state().phase).toBe("valid");
    expect(h.events).toHaveLength(2);
  });
  it("aborts a silent body and releases its capability", async () => {
    const h = harness([started], false);
    const pending = h.consume();
    await vi.waitFor(() => expect(h.events).toHaveLength(1));
    h.controller.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(h.cancel).toHaveBeenCalledTimes(1);
    expect(() => h.vault.generation("run")).toThrow();
  });
  it("does not issue a request with an already aborted signal", async () => {
    const h = harness([started, valid]);
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
