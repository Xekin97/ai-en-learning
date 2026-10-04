import { afterEach, describe, expect, it, vi } from "vitest";
import { computed, effectScope, readonly, ref, watch, type Ref } from "vue";
import { useGenerationStore } from "@runtime/stores/generation";
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
    targets: [],
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
  const cancelReply = deferred<"cancelled" | "valid" | "failed">();
  const savedReply = deferred<{ batchId: string; savedAt: string }>();
  const discardedReply = deferred<undefined>();
  const api = {
    searchVocabulary: vi.fn(async () => ({
      entries: ["learn"],
      version: "test",
    })),
    saveGeneration: vi.fn(() => savedReply.promise),
    discardGeneration: vi.fn(() => discardedReply.promise),
    streamGeneration: vi.fn((_input, emit, signal) => {
      const done = deferred<undefined>();
      streams.push({ emit, signal, done });
      return done.promise;
    }),
    cancelGeneration: vi.fn(() => cancelReply.promise),
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
  vi.stubGlobal("useFeedbackStore", () => ({ show: vi.fn() }));
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
afterEach(() => vi.unstubAllGlobals());

describe("G14 generation request ownership", () => {
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
  it("treats EOF without a terminal as failure and disallows saving", async () => {
    const h = harness();
    await h.select();
    const pending = h.store.generate();
    await tick();
    h.streams[0]!.emit({ kind: "started", runId: "one" });
    h.streams[0]!.emit({ kind: "delta", text: "partial" });
    h.streams[0]!.done.resolve(undefined);
    expect(await pending).toBe(false);
    expect(h.store.state.value.generation).toMatchObject({
      phase: "failed",
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
    "keeps reading when cancellation loses to %s",
    async (terminal) => {
      const h = harness();
      await h.select();
      const pending = h.store.generate();
      await tick();
      h.streams[0]!.emit({ kind: "started", runId: "one" });
      const cancel = h.store.cancel();
      h.cancelReply.resolve(terminal);
      await cancel;
      expect(h.streams[0]!.signal.aborted).toBe(false);
      expect(h.store.state.value.generation.phase).toBe("streaming");
      h.streams[0]!.emit(
        terminal === "valid"
          ? validated("one")
          : {
              kind: "failed",
              code: "provider_unavailable",
              quotaRefunded: true,
              retryable: true,
              requestId: "r",
            },
      );
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
