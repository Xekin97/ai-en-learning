import { onScopeDispose } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { effectScope, readonly, ref, shallowRef, watch, type Ref } from "vue";
import { useLibraryStore } from "@runtime/stores/library";
import { useAccountStore } from "@runtime/stores/account";
import { useReviewStore } from "@runtime/stores/review";
import {
  registerPrivateState,
  resetPrivateStates,
} from "@runtime/session/private-state";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
const authFailure = {
  kind: "authentication_required",
  code: "authentication_required",
  status: 401,
  fields: {},
  requestId: null,
  retryable: false,
};
function harness(api: object) {
  const app = { $api: api };
  const states = new Map<string, Ref<unknown>>();
  const epoch = ref(1);
  const invalidate = vi.fn();
  vi.stubGlobal("useFeedbackStore", () => ({ show: vi.fn() }));
  vi.stubGlobal("useNuxtApp", () => app);
  vi.stubGlobal("useSessionStore", () => ({
    epoch,
    invalidate,
    isLearner: ref(true),
    refreshSecurityContext: vi.fn(async () => {}),
  }));
  vi.stubGlobal("usePrivateState", <T>(key: string, initial: () => T) => {
    const state = ref(initial()) as Ref<T>;
    states.set(key, state);
    registerPrivateState(app, key, state, initial);
    return state;
  });
  vi.stubGlobal("readonly", readonly);
  vi.stubGlobal("shallowRef", shallowRef);
  vi.stubGlobal("watch", watch);
  return {
    states,
    invalidate,
    changeIdentity() {
      epoch.value++;
      resetPrivateStates(app);
    },
  };
}
afterEach(() => vi.unstubAllGlobals());

vi.mock("@runtime/stores/analytics-events", () => ({
  useAnalyticsEvents: () => ({ action: vi.fn() }),
}));

describe("private request lifetime", () => {
  it("does not append an old account library page after identity changes", async () => {
    const next = deferred<{
      items: { id: string }[];
      nextCursor: null;
      hasMore: false;
    }>();
    const h = harness({ listBatches: () => next.promise });
    const store = useLibraryStore();
    Object.assign(h.states.get("library")!.value as object, {
      hasMore: true,
      nextCursor: "old-cursor",
    });
    const pending = store.loadMore();
    h.changeIdentity();
    next.resolve({
      items: [{ id: "private-old-batch" }],
      nextCursor: null,
      hasMore: false,
    });
    await pending;
    expect(store.state.value.batches).toEqual([]);
    expect(store.state.value.status).toBe("idle");
  });
  it.each(["account", "library"] as const)(
    "ignores a stale %s 401 instead of invalidating the new identity",
    async (kind) => {
      const next = deferred<never>();
      const h = harness({
        getAccount: () => next.promise,
        getBatch: () => next.promise,
      });
      const store = kind === "account" ? useAccountStore() : useLibraryStore();
      const pending =
        "loadDetail" in store ? store.loadDetail("old-batch") : store.load();
      h.changeIdentity();
      next.reject(authFailure);
      await pending;
      expect(h.invalidate).not.toHaveBeenCalled();
      expect(store.state.value.failure).toBeNull();
    },
  );
  it("ignores a late review read after logout", async () => {
    const reply = deferred<never>();
    const h = harness({ getReviewSession: () => reply.promise });
    vi.stubGlobal("ref", ref);
    vi.stubGlobal("onScopeDispose", onScopeDispose);
    vi.stubGlobal("onMounted", vi.fn());
    const scope = effectScope();
    try {
      const store = scope.run(() => useReviewStore())!;
      const pending = store.load("old-session");
      h.changeIdentity();
      reply.reject(authFailure);
      await pending;
      expect(store.attempt.value).toBeNull();
      expect(store.session.value).toBeNull();
      expect(store.failure.value).toBeNull();
      expect(h.invalidate).not.toHaveBeenCalled();
    } finally {
      scope.stop();
    }
  });
  it("never resets a different SSR application instance", () => {
    const a = {},
      b = {},
      first = ref("private-a"),
      second = ref("private-b");
    registerPrivateState(a, "same-key", first, () => "");
    registerPrivateState(b, "same-key", second, () => "");
    resetPrivateStates(a);
    expect(first.value).toBe("");
    expect(second.value).toBe("private-b");
  });
});
