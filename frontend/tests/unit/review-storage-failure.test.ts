import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  effectScope,
  onScopeDispose,
  readonly,
  ref,
  shallowRef,
  watch,
} from "vue";
import { useReviewStore } from "@runtime/stores/review";
import {
  DraftConflict,
  InvalidDraft,
  reviewDrafts,
} from "@infrastructure/storage/review-drafts";
import type {
  DraftAttemptModel,
  LocalDraft,
  SessionModel,
  SubmissionModel,
} from "@application/review/models";

vi.mock("@runtime/stores/analytics-events", () => ({
  useAnalyticsEvents: () => ({ action: vi.fn() }),
}));

const attempt: DraftAttemptModel = {
  attemptId: "attempt-1",
  sessionId: "session-1",
  batchId: "batch-1",
  revision: "revision-1",
  tokenExpiresAt: "2099-01-01T00:00:00Z",
  words: [
    {
      questionId: "q1",
      entryMeaning: "适应",
      slots: [{ kind: "letters", count: 5 }],
      hint: [],
    },
  ],
  passage: [],
};
const session: SessionModel = {
  sessionId: "session-1",
  mode: "single_batch",
  status: "active",
  dateRange: null,
  progress: {
    completedBatches: 0,
    totalBatches: 1,
    successfulBatches: 0,
    unsuccessfulBatches: 0,
    skippedBatches: 0,
  },
  currentBatch: null,
  currentAttempt: {
    attemptId: attempt.attemptId,
    revision: attempt.revision,
    state: "draft",
  },
  revision: "session-revision",
};
const submitted: SubmissionModel = {
  outcome: "already_submitted",
  session: { ...session, status: "completed", currentAttempt: null },
  receipt: {
    attemptId: attempt.attemptId,
    batchId: attempt.batchId,
    revision: "submitted-revision",
    submittedAt: "2026-09-21T00:00:00Z",
    successful: false,
    answerState: "answered",
  },
};
function local(letter = "a", revision = 4): LocalDraft {
  return {
    schemaVersion: 1,
    serverRevision: attempt.revision,
    localRevision: revision,
    wordInputs: { q1: [letter, "", "", "", ""] },
    passageInputs: {},
    navigation: {
      step: 0,
      stage: "editing",
      returnToOverview: false,
      focus: null,
    },
  };
}
let scope: ReturnType<typeof effectScope>;
function harness() {
  const epoch = ref(1);
  const api = {
    getReviewSession: vi.fn().mockResolvedValue(session),
    getReviewAttempt: vi.fn().mockResolvedValue({ state: "draft", attempt }),
    submitReviewAttempt: vi.fn().mockResolvedValue(submitted),
    restartReviewAttempt: vi.fn().mockResolvedValue({
      session,
      attempt: { ...attempt, attemptId: "attempt-2" },
    }),
  };
  vi.stubGlobal("useNuxtApp", () => ({ $api: api }));
  vi.stubGlobal("useSessionStore", () => ({
    epoch,
    actor: ref({ kind: "account", id: "owner-1" }),
    refreshSecurityContext: vi.fn().mockResolvedValue(undefined),
    invalidate: vi.fn(),
  }));
  for (const [name, value] of Object.entries({
    ref,
    shallowRef,
    readonly,
    watch,
    onScopeDispose,
    onMounted: vi.fn(),
  }))
    vi.stubGlobal(name, value);
  const read = vi.spyOn(reviewDrafts, "read").mockResolvedValue(null);
  const write = vi.spyOn(reviewDrafts, "write").mockResolvedValue(1);
  const remove = vi.spyOn(reviewDrafts, "remove").mockResolvedValue(undefined);
  vi.spyOn(reviewDrafts, "keys").mockResolvedValue([]);
  scope = effectScope();
  return {
    api,
    epoch,
    read,
    write,
    remove,
    store: scope.run(() => useReviewStore())!,
  };
}
beforeEach(() => vi.useFakeTimers());
afterEach(async () => {
  scope?.stop();
  await Promise.resolve();
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("review when local persistence fails", () => {
  it("keeps editing, navigation and submission in memory when IndexedDB is denied, then retries cleanup", async () => {
    const h = harness();
    h.read.mockRejectedValue(new DOMException("denied", "SecurityError"));
    h.remove.mockRejectedValue(new DOMException("denied", "SecurityError"));
    await h.store.load(session.sessionId);
    expect(h.store.phase.value).toBe("editing");
    expect(h.store.storageFailed.value).toBe(true);
    h.store.word("q1", ["x", "", "", "", ""]);
    h.store.navigate({
      step: 0,
      stage: "overview",
      returnToOverview: false,
      focus: null,
    });
    await h.store.flush();
    expect(h.store.answerFor(attempt.words[0]!)).toBe("x");
    expect(h.store.draft.value?.navigation.stage).toBe("overview");
    await h.store.submit();
    expect(h.api.submitReviewAttempt).toHaveBeenCalledExactlyOnceWith(
      "attempt-1",
      {
        expectedRevision: "revision-1",
        words: [{ questionId: "q1", answer: "x" }],
        passage: [],
      },
    );
    expect(h.store.phase.value).toBe("receipt");
    expect(h.store.draft.value).toBeNull();
    expect(h.store.storageFailed.value).toBe(true);
    h.remove.mockResolvedValue(undefined);
    await h.store.flush();
    expect(h.store.storageFailed.value).toBe(false);
    expect(h.write).not.toHaveBeenCalled();
  });

  it("rechecks unknown storage before saving the latest in-memory input after recovery", async () => {
    const h = harness();
    h.read.mockRejectedValueOnce(new Error("unavailable"));
    await h.store.load(session.sessionId);
    h.store.word("q1", ["b", "", "", "", ""]);
    await h.store.flush();
    expect(h.read).toHaveBeenCalledTimes(2);
    expect(h.write).toHaveBeenCalledWith(
      ["owner-1", "session-1", "attempt-1"],
      expect.objectContaining({ wordInputs: { q1: ["b", "", "", "", ""] } }),
      0,
    );
    expect(h.store.storageFailed.value).toBe(false);
    expect(h.api.getReviewSession).toHaveBeenCalledTimes(1);
  });

  it.each([0, 4])(
    "prompts before using a recovered existing draft at local revision %i",
    async (revision) => {
      const h = harness();
      h.read
        .mockRejectedValueOnce(new Error("unavailable"))
        .mockResolvedValue(local("a", revision));
      await h.store.load(session.sessionId);
      h.store.word("q1", ["b", "", "", "", ""]);
      await h.store.submit();
      expect(h.store.restoreOpen.value).toBe(true);
      expect(h.store.answerFor(attempt.words[0]!)).toBe("b");
      expect(h.write).not.toHaveBeenCalled();
      expect(h.api.submitReviewAttempt).not.toHaveBeenCalled();
      h.store.closeRestore();
      await h.store.flush();
      expect(h.write).not.toHaveBeenCalled();
      h.store.restore();
      expect(h.store.answerFor(attempt.words[0]!)).toBe("a");
      expect(h.store.storageFailed.value).toBe(false);
    },
  );

  it("submits current answers despite write quota failure", async () => {
    const h = harness();
    await h.store.load(session.sessionId);
    h.write.mockRejectedValue(new DOMException("full", "QuotaExceededError"));
    h.store.word("q1", ["y", "", "", "", ""]);
    await h.store.flush();
    expect(h.store.phase.value).toBe("editing");
    expect(h.store.storageFailed.value).toBe(true);
    await h.store.submit();
    expect(h.api.submitReviewAttempt).toHaveBeenCalledWith(
      "attempt-1",
      expect.objectContaining({ words: [{ questionId: "q1", answer: "y" }] }),
    );
    expect(h.store.storageFailed.value).toBe(false);
  });

  it.each(["invalid", "mismatch"])(
    "protects a %s persisted record until explicit restart",
    async (reason) => {
      const h = harness();
      if (reason === "invalid") h.read.mockRejectedValue(new InvalidDraft());
      else
        h.read.mockResolvedValue({
          ...local(),
          serverRevision: "old-question",
        });
      await h.store.load(session.sessionId);
      await h.store.flush();
      await h.store.submit();
      expect(h.store.phase.value).toBe("entry");
      expect(h.write).not.toHaveBeenCalled();
      expect(h.remove).not.toHaveBeenCalled();
      expect(h.api.submitReviewAttempt).not.toHaveBeenCalled();
      h.read.mockResolvedValue(null);
      await h.store.restart();
      expect(h.api.restartReviewAttempt).toHaveBeenCalledExactlyOnceWith(
        "attempt-1",
        "revision-1",
      );
      expect(h.remove).toHaveBeenCalledWith([
        "owner-1",
        "session-1",
        "attempt-1",
      ]);
      expect(h.store.phase.value).toBe("editing");
      expect(h.store.attempt.value?.attemptId).toBe("attempt-2");
    },
  );

  it("ignores recovery reads that finish after an account change", async () => {
    const h = harness();
    h.read.mockRejectedValueOnce(new Error("unavailable"));
    await h.store.load(session.sessionId);
    let resolve!: (value: LocalDraft) => void;
    h.read.mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    h.store.word("q1", ["b", "", "", "", ""]);
    const pending = h.store.flush();
    h.epoch.value++;
    resolve(local());
    await pending;
    expect(h.store.draft.value).toBeNull();
    expect(h.store.restoreOpen.value).toBe(false);
    expect(h.store.storageFailed.value).toBe(false);
    expect(h.write).not.toHaveBeenCalled();
  });

  it("blocks submission after CAS conflict when the conflicting record cannot yet be read", async () => {
    const h = harness();
    await h.store.load(session.sessionId);
    h.write.mockRejectedValue(new DraftConflict());
    h.read.mockRejectedValueOnce(new Error("unavailable"));
    h.store.word("q1", ["b", "", "", "", ""]);
    await h.store.submit();
    expect(h.store.phase.value).toBe("entry");
    expect(h.api.submitReviewAttempt).not.toHaveBeenCalled();
    h.read.mockResolvedValue(local());
    await h.store.flush();
    expect(h.store.restoreOpen.value).toBe(true);
    expect(h.store.answerFor(attempt.words[0]!)).toBe("b");
    expect(h.write).toHaveBeenCalledTimes(1);
  });

  it("clears the unavailable warning on retry even before any answer is entered", async () => {
    const h = harness();
    h.read.mockRejectedValueOnce(new Error("unavailable"));
    await h.store.load(session.sessionId);
    await h.store.flush();
    expect(h.read).toHaveBeenCalledTimes(2);
    expect(h.store.storageFailed.value).toBe(false);
    expect(h.write).not.toHaveBeenCalled();
  });
});
