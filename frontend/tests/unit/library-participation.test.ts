import { afterEach, describe, expect, it, vi } from "vitest";
import { readonly, ref } from "vue";
import { useLibraryStore } from "@runtime/stores/library";
import type { LearningSummaryModel } from "@application/shared/models";

const summary = (participatingBatches = 20): LearningSummaryModel => ({
  generationCount: 22,
  uniqueLearnedEntries: 3,
  participatingBatches,
  pausedBatches: 21 - participatingBatches,
  successfulReviewCount: 4,
  batchesEverReviewedSuccessfully: 2,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}
function harness() {
  const api = {
    getLearningSummary: vi.fn().mockResolvedValue(summary()),
    listBatches: vi.fn().mockResolvedValue({
      items: [{ id: "a", participatesInRangeReview: true }],
      nextCursor: "next",
      hasMore: true,
    }),
    getBatch: vi.fn().mockResolvedValue({
      id: "a",
      participatesInRangeReview: true,
    }),
    setBatchParticipation: vi.fn(async (_id: string, value: boolean) => value),
    deleteBatch: vi.fn().mockResolvedValue(undefined),
  };
  const epoch = ref(1),
    invalidate = vi.fn();
  vi.stubGlobal("useNuxtApp", () => ({ $api: api }));
  vi.stubGlobal("usePrivateState", (_key: string, initial: () => unknown) =>
    ref(initial()),
  );
  vi.stubGlobal("readonly", readonly);
  vi.stubGlobal("useFeedbackStore", () => ({ show: vi.fn() }));
  vi.stubGlobal("useSessionStore", () => ({
    epoch,
    invalidate,
    refreshSecurityContext: vi.fn().mockResolvedValue(undefined),
    actor: ref(null),
  }));
  return { api, epoch, invalidate, store: useLibraryStore() };
}
afterEach(() => vi.unstubAllGlobals());

describe("library participation and authoritative full-library statistics", () => {
  it.each(["", "LEARN"])(
    "refreshes both directions and repeated values without losing query/cursor (%s)",
    async (query) => {
      const { store, api } = harness();
      await store.load(query);
      await store.loadDetail("a");
      for (const [value, count] of [
        [false, 19],
        [false, 19],
        [true, 20],
      ] as const) {
        api.getLearningSummary.mockResolvedValueOnce(summary(count));
        await store.setParticipation("a", value);
        expect(store.state.value.summary).toEqual(summary(count));
        expect(store.state.value.batches[0]?.participatesInRangeReview).toBe(
          value,
        );
        expect(store.state.value.details.a?.participatesInRangeReview).toBe(
          value,
        );
        expect(store.state.value.query).toBe(query);
        expect(store.state.value.nextCursor).toBe("next");
      }
      expect(api.listBatches).toHaveBeenCalledTimes(1);
      expect(api.getLearningSummary).toHaveBeenCalledTimes(4);
    },
  );
  it("keeps confirmed values on PATCH failure, then retries without double counting", async () => {
    const { store, api } = harness();
    await store.load();
    api.setBatchParticipation.mockRejectedValueOnce(new Error("offline"));
    await expect(store.setParticipation("a", false)).rejects.toMatchObject({
      kind: "network",
    });
    expect(store.state.value.summary).toEqual(summary());
    expect(store.state.value.batches[0]?.participatesInRangeReview).toBe(true);
    expect(api.getLearningSummary).toHaveBeenCalledTimes(1);
    api.getLearningSummary.mockResolvedValueOnce(summary(19));
    await store.setParticipation("a", false);
    expect(store.state.value.summary).toEqual(summary(19));
    expect(store.state.value.failure).toBeNull();
  });
  it("retains the confirmed mutation if the subsequent statistics read fails and can refresh", async () => {
    const { store, api } = harness();
    await store.load();
    api.getLearningSummary.mockRejectedValueOnce(new Error("offline"));
    await expect(store.setParticipation("a", false)).rejects.toBeDefined();
    expect(store.state.value.batches[0]?.participatesInRangeReview).toBe(false);
    expect(store.state.value.summary).toEqual(summary());
    expect(store.state.value.failure).not.toBeNull();
    api.getLearningSummary.mockResolvedValueOnce(summary(19));
    await store.setParticipation("a", false);
    expect(store.state.value.summary).toEqual(summary(19));
    expect(store.state.value.failure).toBeNull();
  });
  it("ignores a delayed first toggle summary after a newer toggle has completed", async () => {
    const { store, api } = harness();
    await store.load();
    const old = deferred<LearningSummaryModel>();
    api.getLearningSummary.mockReturnValueOnce(old.promise);
    const first = store.setParticipation("a", false);
    await vi.waitFor(() =>
      expect(api.getLearningSummary).toHaveBeenCalledTimes(2),
    );
    api.getLearningSummary.mockResolvedValueOnce(summary(18));
    await store.setParticipation("b", false);
    old.resolve(summary(19));
    await first;
    expect(store.state.value.summary).toEqual(summary(18));
  });
  it("does not let an older list read overwrite the post-mutation summary", async () => {
    const { store, api } = harness();
    const old = deferred<LearningSummaryModel>();
    api.getLearningSummary.mockReturnValueOnce(old.promise);
    const list = store.load("LEARN");
    api.getLearningSummary.mockResolvedValueOnce(summary(19));
    await store.setParticipation("a", false);
    old.resolve(summary());
    await list;
    expect(store.state.value.summary).toEqual(summary(19));
  });
  it("does not let an older mutation summary overwrite a newer list summary", async () => {
    const { store, api } = harness();
    await store.load();
    const old = deferred<LearningSummaryModel>();
    api.getLearningSummary.mockReturnValueOnce(old.promise);
    const first = store.setParticipation("a", false);
    await vi.waitFor(() =>
      expect(api.getLearningSummary).toHaveBeenCalledTimes(2),
    );
    api.getLearningSummary.mockResolvedValueOnce(summary(18));
    await store.load("LEARN");
    old.resolve(summary(19));
    await first;
    expect(store.state.value.summary).toEqual(summary(18));
  });
  it("does not apply a statistics response after identity changes", async () => {
    const { store, api, epoch } = harness();
    await store.load();
    const old = deferred<LearningSummaryModel>();
    api.getLearningSummary.mockReturnValueOnce(old.promise);
    const first = store.setParticipation("a", false);
    await vi.waitFor(() =>
      expect(api.getLearningSummary).toHaveBeenCalledTimes(2),
    );
    epoch.value++;
    old.resolve(summary(19));
    await first;
    expect(store.state.value.summary).toEqual(summary());
  });
});
