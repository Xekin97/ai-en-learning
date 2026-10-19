import { afterEach, describe, expect, it, vi } from "vitest";
import { computed, effectScope, readonly, ref, watch, type Ref } from "vue";
import { useGenerationStore } from "@runtime/stores/generation";
import { paragraphTexts } from "@application/generation/draft-reducer";
import { resetPrivateStates } from "@runtime/session/private-state";
import type { GenerationEventModel } from "@application/shared/models";

vi.mock("@runtime/stores/analytics-events", () => ({
  useAnalyticsEvents: () => ({ action: vi.fn() }),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
const validated = (id: string): GenerationEventModel => ({
  kind: "validated",
  runId: id,
  result: {
    passage: "We learn.",
    passageSegments: [{ kind: "text", text: "We learn." }],
    tags: ["Study"],
    targets: [
      {
        entry: "learn",
        entryMeaning: "学习",
        hintPhrase: "learn",
        hintSegments: [{ kind: "text", text: "learn" }],
      },
    ],
  },
});
const tick = async () => {
  for (let i = 0; i < 8; i++) await Promise.resolve(undefined);
};
function harness() {
  const streams: {
    emit: (event: GenerationEventModel) => void;
    signal: AbortSignal;
    done: ReturnType<typeof deferred<undefined>>;
  }[] = [];
  const security = vi.fn(async () => {});
  const feedback = { show: vi.fn() };
  const cancelReply = deferred<"cancelled" | "valid" | "failed">();
  const savedReply = deferred<{ batchId: string; savedAt: string }>();
  const discardedReply = deferred<undefined>();
  const api = {
    searchVocabulary: vi.fn(async () => ({
      entries: ["learn"],
      version: "test",
    })),
    randomEntry: vi.fn(async () => ({ entry: "practice", reason: null })),
    saveGeneration: vi.fn(() => savedReply.promise),
    discardGeneration: vi.fn(() => discardedReply.promise),
    streamGeneration: vi.fn((_input, emit, signal) => {
      const done = deferred<undefined>();
      let seq = 0,
        rev = 0,
        begun = false;
      const draft = "draft";
      let phase: "accepted" | "planning" | "composing" | "finalizing" =
        "accepted";
      const mapped = (
        legacy: GenerationEventModel & { text?: string; at?: number },
      ) => {
        if (legacy.kind === "started") {
          seq = 1;
          emit({
            kind: "started",
            seq: 1,
            streamId: "stream-" + legacy.runId,
            runId: legacy.runId,
            snapshot: {
              configurationRevision: "rev",
              effectivePlan: { code: "basic", origin: "base" },
              contentService: {
                nativeValidation: true,
                contentReviewEnabled: false,
                contentRepairLimit: 0,
              },
              nativeCorrectionPolicy: {
                version: "m003-native-policy-v1",
                scope: "logical_request",
                maxCalls: 2,
                editable: false,
              },
            },
          });
          return;
        }
        const composing = () => {
          if (phase === "accepted") {
            emit({ kind: "progress", seq: ++seq, phase: "planning" });
            phase = "planning";
          }
          if (phase === "planning") {
            emit({ kind: "progress", seq: ++seq, phase: "composing" });
            phase = "composing";
          }
        };
        if (legacy.kind === "progress") {
          phase = legacy.phase;
          emit({ ...legacy, seq: ++seq });
          return;
        }
        if (legacy.kind === "plan_item") {
          emit({ ...legacy, seq: ++seq });
          return;
        }
        if (legacy.kind === "delta") {
          composing();
          if (!begun) {
            emit({
              kind: "draft",
              seq: ++seq,
              action: "begin",
              draftId: draft,
              contentVersion: 1,
              baseRev: rev,
              mode: "initial",
            });
            begun = true;
          }
          emit({
            kind: "edit",
            seq: ++seq,
            draftId: draft,
            contentVersion: 1,
            baseRev: rev,
            rev: ++rev,
            at: legacy.at ?? 0,
            deleteCount: 0,
            insert: legacy.text,
            source: "provider",
          });
          return;
        }
        if (legacy.kind === "validated") {
          composing();
          if (begun) {
            emit({
              kind: "draft",
              seq: ++seq,
              action: "body_complete",
              draftId: draft,
              contentVersion: 1,
              baseRev: rev,
              bodyLength: Array.from(legacy.result.passage).length,
              paragraphCount: paragraphTexts(legacy.result.passage).length,
            });
          }
          emit({ kind: "progress", seq: ++seq, phase: "finalizing" });
          phase = "finalizing";
          emit({
            ...legacy,
            seq: ++seq,
            finalContentVersion: 1,
            contentOutcome: "basic",
            completionNotice: null,
          });
          return;
        }
        emit({ ...legacy, seq: ++seq });
      };
      streams.push({ emit: mapped, signal, done });
      return done.promise;
    }),
    cancelGeneration: vi.fn(() => cancelReply.promise),
    getGenerationStatus: vi.fn(async () => {
      throw {
        kind: "capability_expired",
        code: "capability_expired",
        status: 410,
        requestId: null,
        fields: {},
        retryable: false,
      };
    }),
    getGenerationOptions: vi.fn(async () => ({
      models: [{ id: "model", name: "Model", description: null }],
      meaningLanguages: ["en"],
      scenarios: ["story"],
      lengths: ["short"],
      maxEntries: 5,
      availability: { canGenerate: true, reason: null },
      quota: { kind: "unlimited" },
    })),
  };
  const app = { $api: api };
  const states = new Map<string, Ref<unknown>>();
  const epoch = ref(1);
  vi.stubGlobal("useFeedbackStore", () => feedback);
  vi.stubGlobal("useNuxtApp", () => app);
  vi.stubGlobal("useSessionStore", () => ({
    epoch,
    refreshSecurityContext: security,
    isLearner: ref(true),
  }));
  vi.stubGlobal("useState", <T>(key: string, initial: () => T) => {
    if (!states.has(key)) states.set(key, ref(initial()));
    return states.get(key);
  });
  vi.stubGlobal("readonly", readonly);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("watch", watch);
  const scope = effectScope();
  const store = scope.run(() => useGenerationStore())!;
  async function select() {
    await store.loadOptions();
    store.setModel("model");
    store.setMeaningLanguage("en");
    store.setScenario("story");
    store.setLength("short");
    await store.searchVocabulary("learn");
    store.addEntry("learn");
  }
  return {
    store,
    scope,
    streams,
    api,
    feedback,
    security,
    cancelReply,
    savedReply,
    discardedReply,
    select,
    changeIdentity() {
      epoch.value++;
      resetPrivateStates(app);
    },
  };
}
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("G14 generation request ownership", () => {
  it("keeps a previously selected target while consuming filtered candidates and no-candidates", async () => {
    const h = harness();
    h.api.searchVocabulary.mockResolvedValueOnce({
      entries: ["the"],
      version: "before-policy",
    });
    await h.store.loadOptions();
    h.store.setModel("model");
    h.store.setMeaningLanguage("en");
    h.store.setScenario("story");
    h.store.setLength("short");
    await h.store.searchVocabulary("the");
    h.store.addEntry("the");

    h.api.searchVocabulary.mockResolvedValueOnce({
      entries: ["theater", "another"],
      version: "candidate-policy-v1",
    });
    await h.store.searchVocabulary("the");
    expect(h.store.state.value.selectedEntries).toEqual(["the"]);
    expect(h.store.state.value.candidates).toEqual(["theater", "another"]);

    h.api.randomEntry.mockResolvedValueOnce({
      entry: null,
      reason: "no_candidates",
    });
    await h.store.randomEntry();
    expect(h.api.randomEntry).toHaveBeenLastCalledWith(["the"]);
    expect(h.feedback.show).toHaveBeenLastCalledWith("random.none");

    const generation = h.store.generate();
    await tick();
    expect(h.api.streamGeneration.mock.calls[0]?.[0]).toMatchObject({
      entries: ["the"],
    });
    h.streams[0]!.emit({ kind: "started", runId: "old-target" });
    const terminal = validated("old-target");
    terminal.result.targets[0]!.entry = "the";
    h.streams[0]!.emit(terminal);
    h.streams[0]!.done.resolve(undefined);
    await expect(generation).resolves.toBe(true);
    h.scope.stop();
  });

  it("honors generation_busy Retry-After without automatically resubmitting", async () => {
    const h = harness();
    await h.select();
    vi.useFakeTimers();
    h.api.streamGeneration.mockRejectedValueOnce({
      kind: "service_unavailable",
      code: "generation_busy",
      status: 503,
      requestId: "busy-request",
      fields: {},
      retryable: true,
      accepted: false,
      retryAfterSeconds: 3,
    });
    expect(await h.store.generate()).toBe(false);
    expect(h.store.canSubmit.value).toBe(false);
    expect(h.api.streamGeneration).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(2_999);
    expect(h.store.canSubmit.value).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(h.store.canSubmit.value).toBe(true);
    expect(h.api.streamGeneration).toHaveBeenCalledTimes(1);
    h.scope.stop();
  });

  it("cancels a hanging automatic status read at the ten-second deadline", async () => {
    const h = harness();
    await h.select();
    vi.useFakeTimers();
    let statusSignal: AbortSignal | undefined;
    h.api.getGenerationStatus.mockImplementation(
      (_runId: string, signal?: AbortSignal) => {
        statusSignal = signal;
        return new Promise((_resolve, reject) =>
          signal?.addEventListener(
            "abort",
            () => reject(new DOMException("Aborted", "AbortError")),
            { once: true },
          ),
        );
      },
    );
    const pending = h.store.generate();
    await tick();
    h.streams[0]!.emit({ kind: "started", runId: "one" });
    h.streams[0]!.emit({
      kind: "settlement_pending",
      code: "settlement_unconfirmed",
      requestId: "request",
    });
    h.streams[0]!.done.resolve(undefined);
    await tick();
    expect(statusSignal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(statusSignal?.aborted).toBe(true);
    expect(await pending).toBe(false);
    expect(h.store.state.value.generation.phase).toBe("pending");
    h.scope.stop();
  });

  it("retains the visible plan and draft when valid status reports an unavailable result", async () => {
    const h = harness();
    await h.select();
    const pending = h.store.generate();
    await tick();
    h.streams[0]!.emit({ kind: "started", runId: "one" });
    h.streams[0]!.emit({ kind: "progress", phase: "planning" });
    h.streams[0]!.emit({
      kind: "plan_item",
      planId: "plan",
      meaningLanguage: "en",
      item: { kind: "scene", text: "A library" },
    });
    h.streams[0]!.emit({ kind: "progress", phase: "composing" });
    h.streams[0]!.emit({ kind: "delta", text: "Visible draft" });
    const snapshot = h.store.state.value.generation.acceptedSnapshot!;
    h.api.getGenerationStatus.mockResolvedValueOnce({
      status: "valid",
      runId: "one",
      snapshot,
      finalContentVersion: 1,
      result: null,
      contentOutcome: "service_incomplete",
      completionNotice: "content_review_incomplete",
      canSave: false,
      quotaRefunded: false,
    });
    h.streams[0]!.emit({
      kind: "settlement_pending",
      code: "settlement_unconfirmed",
      requestId: "request",
    });
    h.streams[0]!.done.resolve(undefined);
    expect(await pending).toBe(true);
    expect(h.store.state.value.generation).toMatchObject({
      phase: "valid",
      streamedText: "Visible draft",
      planItems: [{ kind: "scene", text: "A library" }],
      result: null,
      resultUnavailable: true,
      contentOutcome: "service_incomplete",
      completionNotice: "content_review_incomplete",
      canSave: false,
    });
    h.scope.stop();
  });
  it("does not submit twice while refreshing the security context", async () => {
    const h = harness();
    await h.select();
    const refresh = deferred<undefined>();
    h.security.mockImplementation(() => refresh.promise);
    const first = h.store.generate();
    const second = h.store.generate();
    refresh.resolve(undefined);
    await tick();
    expect(h.streams).toHaveLength(1);
    h.streams[0]!.emit({ kind: "started", runId: "one" });
    h.streams[0]!.emit(validated("one"));
    h.streams[0]!.done.resolve(undefined);
    expect(await first).toBe(true);
    expect(await second).toBe(false);
    h.scope.stop();
  });
  it.each(["resolve", "reject", "event"] as const)(
    "ignores old request %s after leaving and restarting",
    async (mode) => {
      const h = harness();
      await h.select();
      const old = h.store.generate();
      await tick();
      h.streams[0]!.emit({ kind: "started", runId: "old" });
      h.store.abortPassive();
      const next = h.store.generate();
      await tick();
      h.streams[1]!.emit({ kind: "started", runId: "new" });
      if (mode === "event") {
        h.streams[0]!.emit({ kind: "delta", text: "OLD" });
        h.streams[0]!.emit(validated("old"));
      }
      if (mode === "reject")
        h.streams[0]!.done.reject(new Error("old transport"));
      else h.streams[0]!.done.resolve(undefined);
      expect(await old).toBe(false);
      expect(h.store.state.value.generation).toMatchObject({
        phase: "streaming",
        runId: "new",
        streamedText: "",
      });
      h.store.abortPassive();
      expect(h.streams[1]!.signal.aborted).toBe(true);
      h.streams[1]!.done.resolve(undefined);
      await next;
      h.scope.stop();
    },
  );
  it("does not submit a request after leaving during security refresh", async () => {
    const h = harness();
    await h.select();
    const refresh = deferred<undefined>();
    h.security.mockImplementation(() => refresh.promise);
    const pending = h.store.generate();
    h.store.abortPassive();
    refresh.resolve(undefined);
    expect(await pending).toBe(false);
    expect(h.api.streamGeneration).not.toHaveBeenCalled();
    h.scope.stop();
  });
  it("projects a security refresh failure into the existing error state", async () => {
    const h = harness();
    await h.select();
    h.security.mockRejectedValue(new Error("bootstrap unavailable"));
    expect(await h.store.generate()).toBe(false);
    expect(h.store.state.value.generation.phase).toBe("failed");
    expect(h.api.streamGeneration).not.toHaveBeenCalled();
    h.scope.stop();
  });
  it.each(["valid", "failed", "cancelled"] as const)(
    "preserves %s after a later reader rejection",
    async (terminal) => {
      const h = harness();
      await h.select();
      const pending = h.store.generate();
      await tick();
      h.streams[0]!.emit({ kind: "started", runId: "one" });
      h.streams[0]!.emit(
        terminal === "valid"
          ? validated("one")
          : terminal === "failed"
            ? {
                kind: "failed",
                code: "provider_unavailable",
                quotaRefunded: true,
                retryable: false,
                requestId: "request-one",
              }
            : { kind: "cancelled", quotaRefunded: false },
      );
      h.streams[0]!.done.reject(new Error("late reader failure"));
      await pending;
      expect(h.store.state.value.generation.phase).toBe(terminal);
      h.scope.stop();
    },
  );
  it("keeps EOF without a terminal pending and disallows saving", async () => {
    const h = harness();
    await h.select();
    const pending = h.store.generate();
    await tick();
    h.streams[0]!.emit({ kind: "started", runId: "one" });
    h.streams[0]!.emit({ kind: "delta", text: "partial" });
    h.streams[0]!.done.resolve(undefined);
    expect(await pending).toBe(false);
    expect(h.store.state.value.generation).toMatchObject({
      phase: "pending",
      result: null,
    });
    await expect(h.store.save()).rejects.toThrow();
    h.scope.stop();
  });
  it("clears private generation and stops callbacks on identity change", async () => {
    const h = harness();
    await h.select();
    const pending = h.store.generate();
    await tick();
    h.streams[0]!.emit({ kind: "started", runId: "old" });
    h.streams[0]!.emit({ kind: "delta", text: "private" });
    h.changeIdentity();
    expect(h.streams[0]!.signal.aborted).toBe(true);
    h.streams[0]!.emit(validated("old"));
    h.streams[0]!.done.resolve(undefined);
    await pending;
    expect(h.store.state.value.generation).toMatchObject({
      phase: "idle",
      runId: null,
      result: null,
      streamedText: "",
    });
    h.scope.stop();
  });
  it("does not share controllers across two Nuxt application instances", async () => {
    const a = harness();
    await a.select();
    const first = a.store.generate();
    await tick();
    const b = harness();
    await b.select();
    b.store.startNewTask();
    expect(a.streams[0]!.signal.aborted).toBe(false);
    a.store.abortPassive();
    a.streams[0]!.done.resolve(undefined);
    await first;
    a.scope.stop();
    b.scope.stop();
  });
});

describe("G14 saved/discarded draft ownership", () => {
  it("returns a receipt only after the current valid run is discarded", async () => {
    const h = harness();
    await h.select();
    const generated = h.store.generate();
    await tick();
    h.streams[0]!.emit({ kind: "started", runId: "old" });
    h.streams[0]!.emit(validated("old"));
    h.streams[0]!.done.resolve(undefined);
    await generated;

    const discarded = h.store.discard();
    await tick();
    expect(h.api.discardGeneration).toHaveBeenCalledWith("old");
    h.discardedReply.resolve(undefined);
    const receipt = await discarded;
    expect(receipt).toEqual({
      runId: "old",
      clearedGeneration: h.store.state.value.generation,
    });
    expect(receipt?.clearedGeneration).toBe(h.store.state.value.generation);
    expect(h.store.state.value.generation.phase).toBe("idle");
    h.scope.stop();
  });

  it("returns no discard receipt when identity changes during security refresh", async () => {
    const h = harness();
    await h.select();
    const generated = h.store.generate();
    await tick();
    h.streams[0]!.emit({ kind: "started", runId: "old" });
    h.streams[0]!.emit(validated("old"));
    h.streams[0]!.done.resolve(undefined);
    await generated;
    const refresh = deferred<undefined>();
    h.security.mockImplementation(() => refresh.promise);

    const discarded = h.store.discard();
    h.changeIdentity();
    refresh.resolve(undefined);
    expect(await discarded).toBeNull();
    expect(h.api.discardGeneration).not.toHaveBeenCalled();
    expect(h.store.state.value.generation.phase).toBe("idle");
    h.scope.stop();
  });

  it("does not clear a new task when a stale discard reply arrives", async () => {
    const h = harness();
    await h.select();
    const generated = h.store.generate();
    await tick();
    h.streams[0]!.emit({ kind: "started", runId: "old" });
    h.streams[0]!.emit(validated("old"));
    h.streams[0]!.done.resolve(undefined);
    await generated;

    const discarded = h.store.discard();
    await tick();
    h.store.startNewTask();
    await h.select();
    const next = h.store.generate();
    await tick();
    h.streams[1]!.emit({ kind: "started", runId: "new" });
    h.discardedReply.resolve(undefined);

    expect(await discarded).toBeNull();
    expect(h.store.state.value.generation).toMatchObject({
      phase: "streaming",
      runId: "new",
    });
    h.store.abortPassive();
    h.streams[1]!.done.resolve(undefined);
    await next;
    h.scope.stop();
  });

  it("keeps the valid result when discard fails", async () => {
    const h = harness();
    await h.select();
    const generated = h.store.generate();
    await tick();
    h.streams[0]!.emit({ kind: "started", runId: "old" });
    h.streams[0]!.emit(validated("old"));
    h.streams[0]!.done.resolve(undefined);
    await generated;

    const discarded = h.store.discard();
    await tick();
    h.discardedReply.reject(new Error("discard unavailable"));
    await expect(discarded).rejects.toThrow("discard unavailable");
    expect(h.store.state.value.generation).toMatchObject({
      phase: "valid",
      runId: "old",
      result: { passage: "We learn." },
    });
    h.scope.stop();
  });

  it("rejects a direct generation while settlement is pending", async () => {
    const h = harness();
    await h.select();
    const first = h.store.generate();
    await tick();
    h.streams[0]!.emit({ kind: "started", runId: "old" });
    h.streams[0]!.emit({
      kind: "settlement_pending",
      code: "settlement_unconfirmed",
      requestId: "request",
    });
    expect(h.store.state.value.generation.phase).toBe("pending");
    expect(h.store.canSubmit.value).toBe(false);
    expect(await h.store.generate()).toBe(false);
    expect(h.api.streamGeneration).toHaveBeenCalledTimes(1);
    h.streams[0]!.done.resolve(undefined);
    await first;
    h.scope.stop();
  });

  it.each(["save", "discard"] as const)(
    "does not apply a late %s to a new task",
    async (action) => {
      const h = harness();
      await h.select();
      const generated = h.store.generate();
      await tick();
      h.streams[0]!.emit({ kind: "started", runId: "old" });
      h.streams[0]!.emit(validated("old"));
      h.streams[0]!.done.resolve(undefined);
      await generated;
      const mutation = h.store[action]().then(
        () => "resolved",
        () => "rejected",
      );
      await tick();
      h.store.startNewTask();
      await h.select();
      const next = h.store.generate();
      await tick();
      h.streams[1]!.emit({ kind: "started", runId: "new" });
      if (action === "save")
        h.savedReply.resolve({
          batchId: "old-batch",
          savedAt: "2026-09-10T00:00:00Z",
        });
      else h.discardedReply.resolve(undefined);
      await mutation;
      expect(h.store.state.value.generation).toMatchObject({
        phase: "streaming",
        runId: "new",
      });
      h.store.abortPassive();
      h.streams[1]!.done.resolve(undefined);
      await next;
      h.scope.stop();
    },
  );
  it("does not send a save after identity changed during security refresh", async () => {
    const h = harness();
    await h.select();
    const generated = h.store.generate();
    await tick();
    h.streams[0]!.emit({ kind: "started", runId: "old" });
    h.streams[0]!.emit(validated("old"));
    h.streams[0]!.done.resolve(undefined);
    await generated;
    const refresh = deferred<undefined>();
    h.security.mockImplementation(() => refresh.promise);
    const pending = h.store.save().then(
      () => "resolved",
      () => "rejected",
    );
    h.changeIdentity();
    refresh.resolve(undefined);
    await tick();
    expect(h.api.saveGeneration).not.toHaveBeenCalled();
    expect(await pending).toBe("rejected");
    h.scope.stop();
  });
});

describe("G14 cancellation races", () => {
  it.each(["valid", "failed"] as const)(
    "reads authoritative status when cancellation loses to %s",
    async (terminal) => {
      const h = harness();
      await h.select();
      const pending = h.store.generate();
      await tick();
      h.streams[0]!.emit({ kind: "started", runId: "one" });
      const snapshot = {
        configurationRevision: "rev",
        effectivePlan: { code: "basic" as const, origin: "base" as const },
        contentService: {
          nativeValidation: true as const,
          contentReviewEnabled: false as const,
          contentRepairLimit: 0 as const,
        },
        nativeCorrectionPolicy: {
          version: "m003-native-policy-v1" as const,
          scope: "logical_request" as const,
          maxCalls: 2 as const,
          editable: false as const,
        },
      };
      h.api.getGenerationStatus.mockResolvedValueOnce(
        terminal === "valid"
          ? {
              status: "valid",
              runId: "one",
              snapshot,
              finalContentVersion: 1,
              result: validated("one").result,
              contentOutcome: "basic",
              completionNotice: null,
              canSave: true,
              quotaRefunded: false,
            }
          : { status: "failed", runId: "one", snapshot, quotaRefunded: true },
      );
      const cancel = h.store.cancel();
      h.cancelReply.resolve(terminal);
      await cancel;
      expect(h.streams[0]!.signal.aborted).toBe(true);
      expect(h.store.state.value.generation.phase).toBe(terminal);
      h.streams[0]!.done.resolve(undefined);
      await pending;
      expect(h.store.state.value.generation.phase).toBe(terminal);
      h.scope.stop();
    },
  );
  it("does not overwrite a completed result with a delayed cancel acknowledgement", async () => {
    const h = harness();
    await h.select();
    const pending = h.store.generate();
    await tick();
    h.streams[0]!.emit({ kind: "started", runId: "one" });
    const cancel = h.store.cancel();
    h.streams[0]!.emit(validated("one"));
    h.streams[0]!.done.resolve(undefined);
    await pending;
    h.cancelReply.resolve("valid");
    await cancel;
    expect(h.store.state.value.generation.phase).toBe("valid");
    h.scope.stop();
  });
  it("queues early cancellation until started supplies its capability", async () => {
    const h = harness();
    await h.select();
    const pending = h.store.generate();
    await tick();
    const cancel = h.store.cancel();
    await tick();
    expect(h.api.cancelGeneration).not.toHaveBeenCalled();
    expect(h.streams[0]!.signal.aborted).toBe(false);
    h.streams[0]!.emit({ kind: "started", runId: "one" });
    await tick();
    expect(h.api.cancelGeneration).toHaveBeenCalledWith("one");
    h.cancelReply.resolve("cancelled");
    await cancel;
    await tick();
    expect(h.streams[0]!.signal.aborted).toBe(true);
    expect(h.store.state.value.generation.phase).toBe("cancelled");
    h.streams[0]!.done.resolve(undefined);
    await pending;
    h.scope.stop();
  });
  it("handles cancel transport failure without pretending cancellation succeeded", async () => {
    const h = harness();
    await h.select();
    const pending = h.store.generate();
    await tick();
    h.streams[0]!.emit({ kind: "started", runId: "one" });
    const cancel = h.store.cancel();
    h.cancelReply.reject(new Error("cancel reply unavailable"));
    await expect(cancel).resolves.toBeUndefined();
    expect(h.store.state.value.generation.phase).toBe("streaming");
    expect(h.streams[0]!.signal.aborted).toBe(false);
    h.streams[0]!.emit(validated("one"));
    h.streams[0]!.done.resolve(undefined);
    expect(await pending).toBe(true);
    h.scope.stop();
  });
  it("deduplicates simultaneous cancellation requests", async () => {
    const h = harness();
    await h.select();
    const pending = h.store.generate();
    await tick();
    h.streams[0]!.emit({ kind: "started", runId: "one" });
    const a = h.store.cancel();
    const b = h.store.cancel();
    expect(h.api.cancelGeneration).toHaveBeenCalledTimes(1);
    h.cancelReply.resolve("cancelled");
    await Promise.all([a, b]);
    h.streams[0]!.done.resolve(undefined);
    await pending;
    h.scope.stop();
  });
});
