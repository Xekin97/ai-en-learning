import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canStartRange,
  createReviewSetupActions,
  createReviewSetupState,
  isCalendarDate,
  localSevenDayRange,
} from "@application/review/range-setup";
import type {
  ActiveRangeModel,
  AppFailure,
  ReviewRangePreviewModel,
  ReviewSessionCreatedModel,
} from "@application/shared/models";
import {
  reviewRangePreviewEnvelopeSchema,
  activeRangeEnvelopeSchema,
  reviewSessionCreatedEnvelopeSchema,
} from "@infrastructure/http/schemas/review";
import {
  mapReviewRangePreviewDto,
  mapActiveRangeDto,
  mapReviewSessionCreatedDto,
} from "@infrastructure/http/mappers";

const query = {
  startDate: "2026-08-31",
  endDate: "2026-09-06",
  timezone: "Asia/Shanghai",
};
const ready = (): ReviewRangePreviewModel =>
  mapReviewRangePreviewDto(
    reviewRangePreviewEnvelopeSchema.parse({
      data: { batch_count: 2, entry_count: 6, empty: false },
      meta: { request_id: "req-range" },
    }).data,
  );
const empty = (): ReviewRangePreviewModel =>
  mapReviewRangePreviewDto(
    reviewRangePreviewEnvelopeSchema.parse({
      data: { batch_count: 0, entry_count: 0, empty: true },
      meta: { request_id: "req-empty" },
    }).data,
  );
const progress = {
  completed_batches: 2,
  total_batches: 5,
  successful_batches: 2,
  unsuccessful_batches: 0,
};
function active(): ActiveRangeModel {
  const dto = activeRangeEnvelopeSchema.parse({
    data: {
      session: {
        session_id: "old-range",
        mode: "range",
        status: "active",
        date_range: {
          start_date: "2026-08-01",
          end_date: "2026-08-31",
          timezone: "UTC",
        },
        progress,
      },
    },
    meta: { request_id: "req-active" },
  }).data.session;
  if (!dto) throw new Error("fixture");
  return mapActiveRangeDto(dto);
}
function created(): ReviewSessionCreatedModel {
  return mapReviewSessionCreatedDto(
    reviewSessionCreatedEnvelopeSchema.parse({
      data: {
        session_id: "old-range",
        mode: "range",
        status: "active",
        reused: true,
        date_range: {
          start_date: "2026-08-01",
          end_date: "2026-08-31",
          timezone: "UTC",
        },
        progress,
        current_batch: {
          batch_id: "batch-old",
          saved_at: "2026-08-20T12:00:00Z",
          scenario: "story",
        },
      },
      meta: { request_id: "req-created" },
    }).data,
  );
}
const network: AppFailure = {
  kind: "network",
  code: "network_error",
  status: null,
  requestId: null,
  fields: {},
  retryable: true,
};
const auth: AppFailure = {
  ...network,
  kind: "authentication_required",
  code: "authentication_required",
  status: 401,
};
function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}
function harness() {
  let state = createReviewSetupState(),
    epoch = 1,
    learner = true;
  const api = {
    previewReviewRange: vi.fn(async () => ready()),
    getActiveRange: vi.fn(async (): Promise<ActiveRangeModel | null> =>
      active(),
    ),
    createReviewSession: vi.fn(async () => created()),
  };
  const refreshSecurity = vi.fn(async () => {});
  const authenticationRequired = vi.fn(() => {
    epoch++;
    learner = false;
    state = createReviewSetupState();
  });
  const actions = createReviewSetupActions({
    state: () => state,
    api,
    epoch: () => epoch,
    isLearner: () => learner,
    refreshSecurity,
    authenticationRequired,
  });
  const owner = actions.enter();
  function init() {
    actions.initializeBrowser(owner, new Date(2026, 8, 6, 12), query.timezone);
  }
  return {
    actions,
    owner,
    api,
    refreshSecurity,
    authenticationRequired,
    init,
    state: () => state,
    switchAccount() {
      epoch++;
      state = createReviewSetupState();
    },
    guest() {
      learner = false;
    },
  };
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("calendar and contract boundary", () => {
  it.each([
    "2026-02-29",
    "1900-02-29",
    "2026-04-31",
    "0000-01-01",
    "2026-13-01",
    "2026-00-01",
    "2026-01-00",
    "2026-1-01",
    "bad",
    "",
  ])("rejects %s", (date) => expect(isCalendarDate(date)).toBe(false));
  it.each(["2024-02-29", "2000-02-29", "2026-09-06", "0001-01-01"])(
    "accepts %s",
    (date) => expect(isCalendarDate(date)).toBe(true),
  );
  it("uses local calendar days across months and leap days", () => {
    expect(localSevenDayRange(new Date(2024, 2, 1, 12), "UTC")).toEqual({
      startDate: "2024-02-24",
      endDate: "2024-03-01",
      timezone: "UTC",
    });
    expect(localSevenDayRange(new Date(2026, 0, 3, 12), "UTC").startDate).toBe(
      "2025-12-28",
    );
  });
  it.each([
    { batch_count: -1, entry_count: 1, empty: false },
    { batch_count: 1.5, entry_count: 1, empty: false },
    { batch_count: 0, entry_count: 0, empty: false },
    { batch_count: 1, entry_count: 1, empty: true },
    { batch_count: 1, empty: false },
    { batch_count: 1, entry_count: 1, empty: false, range_key: "invented" },
  ])("rejects malformed raw preview %j", (data) => {
    expect(
      reviewRangePreviewEnvelopeSchema.safeParse({
        data,
        meta: { request_id: "req-invalid" },
      }).success,
    ).toBe(false);
  });
  it("maps null active and strict server reuse without leaking DTO fields", () => {
    expect(
      activeRangeEnvelopeSchema.parse({
        data: { session: null },
        meta: { request_id: "req" },
      }).data.session,
    ).toBeNull();
    expect(created().reused).toBe(true);
    expect(created().session.dateRange?.startDate).toBe("2026-08-01");
    expect(ready()).toEqual({ batchCount: 2, entryCount: 6, empty: false });
    expect(JSON.stringify(active())).not.toMatch(
      /session_id|request_id|completed_batches/,
    );
  });
});

describe("range setup lifecycle", () => {
  it("SSR starts neutral without guessing dates or making preview requests", async () => {
    const h = harness();
    await h.actions.loadResume(h.owner);
    expect(h.state().draft).toEqual({
      startDate: "",
      endDate: "",
      timezone: null,
      initialized: false,
    });
    expect(h.api.previewReviewRange).not.toHaveBeenCalled();
    expect(h.actions.resumeTarget(h.owner)).toBe("old-range");
    expect(canStartRange(h.state(), true)).toBe(false);
  });
  it("initializes once and preserves deliberately cleared drafts on later visits", async () => {
    const h = harness();
    h.init();
    expect(h.state().draft).toEqual({ ...query, initialized: true });
    h.actions.changeDate(h.owner, "startDate", "");
    const next = h.actions.enter();
    h.actions.initializeBrowser(next, new Date(2026, 9, 1), query.timezone);
    expect(h.state().draft.startDate).toBe("");
    await h.actions.preview(next);
    expect(h.state().preview.kind).toBe("invalid");
  });
  it("invalid timezone remains an explicit failure without UTC fallback", () => {
    const h = harness();
    expect(h.actions.initializeBrowser(h.owner, new Date(), null)).toBe(false);
    expect(
      h.actions.initializeBrowser(h.owner, new Date(), "invalid-zone"),
    ).toBe(false);
    expect(h.state().draft.timezone).toBeNull();
    expect(h.state().preview.kind).toBe("failed");
    expect(h.api.previewReviewRange).not.toHaveBeenCalled();
  });
  it("old→empty→ready retains the draft and independent resume", async () => {
    const h = harness();
    h.init();
    await h.actions.loadResume(h.owner);
    h.api.previewReviewRange
      .mockResolvedValueOnce(empty())
      .mockResolvedValueOnce(ready());
    await h.actions.preview(h.owner);
    expect(h.state().preview.kind).toBe("empty");
    expect(h.actions.resumeTarget(h.owner)).toBe("old-range");
    await h.actions.preview(h.owner);
    expect(canStartRange(h.state(), true)).toBe(true);
    expect(h.state().draft).toEqual({ ...query, initialized: true });
  });
  it.each(["", "2026-02-30", "2026-09-07"])(
    "invalid start %s has no GET/POST and keeps resume",
    async (value) => {
      const h = harness();
      h.init();
      await h.actions.loadResume(h.owner);
      h.actions.changeDate(h.owner, "startDate", value);
      expect(h.state().preview.kind).toBe("invalid");
      expect(await h.actions.start(h.owner)).toBeNull();
      expect(h.api.previewReviewRange).not.toHaveBeenCalled();
      expect(h.api.createReviewSession).not.toHaveBeenCalled();
      expect(h.actions.resumeTarget(h.owner)).toBe("old-range");
    },
  );
  it("permits an inclusive same-day range", async () => {
    const h = harness();
    h.init();
    h.actions.changeDate(h.owner, "startDate", query.endDate);
    await h.actions.preview(h.owner);
    expect(h.state().preview.kind).toBe("ready");
    expect(h.api.previewReviewRange).toHaveBeenCalledWith(
      { ...query, startDate: query.endDate },
      expect.any(AbortSignal),
    );
  });
  it("invalidates before debounce, ignores a slow earlier request and late finally", async () => {
    vi.useFakeTimers();
    const h = harness();
    h.init();
    await h.actions.preview(h.owner);
    const slow = deferred<ReviewRangePreviewModel>();
    h.api.previewReviewRange.mockReturnValueOnce(slow.promise);
    const old = h.actions.preview(h.owner);
    h.actions.changeDate(h.owner, "startDate", "2026-08-01");
    expect(canStartRange(h.state(), true)).toBe(false);
    slow.resolve(empty());
    await old;
    expect(h.state().preview.kind).toBe("loading");
    await vi.advanceTimersByTimeAsync(250);
    expect(h.state().preview.kind).toBe("ready");
    expect(h.api.previewReviewRange).toHaveBeenLastCalledWith(
      { ...query, startDate: "2026-08-01" },
      expect.any(AbortSignal),
    );
  });
  it("A→B→A rejects old A even if the underlying transport ignores abort", async () => {
    vi.useFakeTimers();
    const h = harness();
    h.init();
    const slow = deferred<ReviewRangePreviewModel>();
    h.api.previewReviewRange.mockReturnValueOnce(slow.promise);
    const old = h.actions.preview(h.owner);
    h.actions.changeDate(h.owner, "startDate", "2026-08-01");
    h.actions.changeDate(h.owner, "startDate", query.startDate);
    await vi.advanceTimersByTimeAsync(250);
    slow.resolve(empty());
    await old;
    expect(h.state().preview.kind).toBe("ready");
  });
  it("preview failure and recovery do not erase active range", async () => {
    const h = harness();
    h.init();
    await h.actions.loadResume(h.owner);
    h.api.previewReviewRange.mockRejectedValueOnce(network);
    await h.actions.preview(h.owner);
    expect(h.state().preview.kind).toBe("failed");
    expect(h.actions.resumeTarget(h.owner)).toBe("old-range");
    await h.actions.preview(h.owner);
    expect(h.state().preview.kind).toBe("ready");
  });
  it("resume failure does not block ready preview", async () => {
    const h = harness();
    h.init();
    h.api.getActiveRange.mockRejectedValueOnce(network);
    await Promise.all([
      h.actions.loadResume(h.owner),
      h.actions.preview(h.owner),
    ]);
    expect(h.state().resume.status).toBe("failed");
    expect(canStartRange(h.state(), true)).toBe(true);
  });
  it("leaving cancels the debounce and ignores pending resume", async () => {
    vi.useFakeTimers();
    const h = harness();
    h.init();
    const pending = deferred<ActiveRangeModel | null>();
    h.api.getActiveRange.mockReturnValueOnce(pending.promise);
    const load = h.actions.loadResume(h.owner);
    h.actions.changeDate(h.owner, "startDate", "2026-08-01");
    h.actions.dispose(h.owner);
    await vi.advanceTimersByTimeAsync(500);
    pending.resolve(active());
    await load;
    expect(h.api.previewReviewRange).not.toHaveBeenCalled();
    expect(h.actions.resumeTarget(h.owner)).toBeNull();
  });
  it("old page disposal does not cancel a new visit", async () => {
    const h = harness();
    h.init();
    const next = h.actions.enter();
    h.actions.dispose(h.owner);
    await h.actions.preview(next);
    expect(h.state().preview.kind).toBe("ready");
  });
  it.each(["resolve", "reject"] as const)(
    "old identity %s cannot write state or invalidate the new actor",
    async (outcome) => {
      const h = harness();
      h.init();
      const slow = deferred<ReviewRangePreviewModel>();
      h.api.previewReviewRange.mockReturnValueOnce(slow.promise);
      const load = h.actions.preview(h.owner);
      h.switchAccount();
      if (outcome === "resolve") slow.resolve(ready());
      else slow.reject(auth);
      await load;
      expect(h.state()).toEqual(createReviewSetupState());
      expect(h.authenticationRequired).not.toHaveBeenCalled();
    },
  );
  it("current 401 clears private state; guests cannot request or create", async () => {
    const h = harness();
    h.init();
    h.api.previewReviewRange.mockRejectedValueOnce(auth);
    await h.actions.preview(h.owner);
    expect(h.authenticationRequired).toHaveBeenCalledOnce();
    await h.actions.preview(h.owner);
    await h.actions.start(h.owner);
    expect(h.state()).toEqual(createReviewSetupState());
    expect(h.api.previewReviewRange).toHaveBeenCalledOnce();
    expect(h.api.createReviewSession).not.toHaveBeenCalled();
  });
});

describe("create guard and reconciliation", () => {
  it("security refresh failure releases the command lock without posting", async () => {
    const h = harness();
    h.init();
    await h.actions.preview(h.owner);
    h.refreshSecurity.mockRejectedValueOnce(network);
    expect(await h.actions.start(h.owner)).toBeNull();
    expect(h.api.createReviewSession).not.toHaveBeenCalled();
    expect(h.state().create.status).toBe("failed");
    expect(canStartRange(h.state(), true)).toBe(true);
    expect(await h.actions.start(h.owner)).toBe("old-range");
  });
  it("double click takes one synchronous lock and accepts server reuse", async () => {
    const h = harness();
    h.init();
    await h.actions.preview(h.owner);
    const gate = deferred<undefined>();
    h.refreshSecurity.mockReturnValueOnce(gate.promise);
    const first = h.actions.start(h.owner);
    expect(await h.actions.start(h.owner)).toBeNull();
    expect(canStartRange(h.state(), true)).toBe(false);
    gate.resolve(undefined);
    expect(await first).toBe("old-range");
    expect(h.api.createReviewSession).toHaveBeenCalledOnce();
  });
  it("date change during security refresh prevents POST", async () => {
    const h = harness();
    h.init();
    await h.actions.preview(h.owner);
    const gate = deferred<undefined>();
    h.refreshSecurity.mockReturnValueOnce(gate.promise);
    const first = h.actions.start(h.owner);
    h.actions.changeDate(h.owner, "startDate", "");
    gate.resolve(undefined);
    expect(await first).toBeNull();
    expect(h.api.createReviewSession).not.toHaveBeenCalled();
  });
  it("date change after dispatch does not rewrite the captured request", async () => {
    const h = harness();
    h.init();
    await h.actions.preview(h.owner);
    const pending = deferred<ReviewSessionCreatedModel>();
    h.api.createReviewSession.mockReturnValueOnce(pending.promise);
    const first = h.actions.start(h.owner);
    await Promise.resolve();
    h.actions.changeDate(h.owner, "startDate", "");
    pending.resolve(created());
    expect(await first).toBe("old-range");
    expect(h.api.createReviewSession).toHaveBeenCalledWith({
      mode: "range",
      ...query,
    });
  });
  it.each(["leave", "account"] as const)(
    "late create after %s never navigates",
    async (mode) => {
      const h = harness();
      h.init();
      await h.actions.preview(h.owner);
      const pending = deferred<ReviewSessionCreatedModel>();
      h.api.createReviewSession.mockReturnValueOnce(pending.promise);
      const first = h.actions.start(h.owner);
      await Promise.resolve();
      if (mode === "leave") h.actions.dispose(h.owner);
      else h.switchAccount();
      pending.resolve(created());
      expect(await first).toBeNull();
    },
  );
  it("uncertain POST gets active range once, never replays, and exposes resume", async () => {
    const h = harness();
    h.init();
    await h.actions.preview(h.owner);
    h.api.createReviewSession.mockRejectedValueOnce(network);
    expect(await h.actions.start(h.owner)).toBeNull();
    expect(h.api.createReviewSession).toHaveBeenCalledOnce();
    expect(h.api.getActiveRange).toHaveBeenCalledOnce();
    expect(h.actions.resumeTarget(h.owner)).toBe("old-range");
    expect(h.state().create.status).toBe("failed");
  });
  it("holds the submission lock while reconciling and does not invent empty on 422", async () => {
    const h = harness();
    h.init();
    await h.actions.preview(h.owner);
    const pending = deferred<ActiveRangeModel | null>();
    h.api.getActiveRange.mockReturnValueOnce(pending.promise);
    h.api.createReviewSession.mockRejectedValueOnce({
      ...network,
      kind: "validation",
      status: 422,
    });
    const first = h.actions.start(h.owner);
    await Promise.resolve();
    await Promise.resolve();
    expect(await h.actions.start(h.owner)).toBeNull();
    pending.resolve(null);
    await first;
    expect(h.state().preview.kind).toBe("ready");
    expect(h.state().create.status).toBe("failed");
  });
});
