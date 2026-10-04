import { afterEach, expect, it, vi } from "vitest";
import {
  createVocabularySearch,
  type VocabularySearchState,
} from "../../app/application/generation/vocabulary-search";
afterEach(() => vi.useRealTimers());
it("invalidates old results immediately, before the next debounce request", async () => {
  vi.useFakeTimers();
  let state: VocabularySearchState;
  const requests: {
    q: string;
    signal: AbortSignal;
    resolve: (v: { entries: string[] }) => void;
  }[] = [];
  const search = createVocabularySearch(
    (q, signal) =>
      new Promise((resolve) => requests.push({ q, signal, resolve })),
    () => 1,
    (s) => {
      state = s;
    },
  );
  search.setQuery("old");
  await vi.advanceTimersByTimeAsync(180);
  search.setQuery("new");
  expect(requests[0]!.signal.aborted).toBe(true);
  requests[0]!.resolve({ entries: ["old"] });
  await Promise.resolve();
  expect(state!).toEqual({
    query: "new",
    candidates: [],
    searchStatus: "loading",
  });
  await vi.advanceTimersByTimeAsync(180);
  requests[1]!.resolve({ entries: ["new word"] });
  await Promise.resolve();
  expect(state!.candidates).toEqual(["new word"]);
  search.reset();
  expect(state!.searchStatus).toBe("idle");
});
it("does not publish a response after an account change or disposal", async () => {
  let epoch = 1,
    resolve!: (v: { entries: string[] }) => void;
  const update = vi.fn();
  const search = createVocabularySearch(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
    () => epoch,
    update,
  );
  const pending = search.search("a");
  epoch++;
  resolve({ entries: ["a"] });
  await pending;
  expect(update).toHaveBeenCalledTimes(1);
  const next = search.search("b");
  search.reset();
  resolve({ entries: ["b"] });
  await next;
  expect(update.mock.lastCall?.[0]).toEqual({
    query: "",
    candidates: [],
    searchStatus: "idle",
  });
});
it("preserves selected candidates, distinguishes empty and failure, and can retry", async () => {
  const update = vi.fn(),
    port = vi
      .fn()
      .mockResolvedValueOnce({ entries: ["according to"] })
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({ entries: [] });
  const search = createVocabularySearch(port, () => 1, update);
  await search.search("according");
  expect(update.mock.lastCall?.[0].candidates).toEqual(["according to"]);
  await search.search("x");
  expect(update.mock.lastCall?.[0].searchStatus).toBe("failed");
  await search.search("x");
  expect(update.mock.lastCall?.[0].searchStatus).toBe("empty");
});
