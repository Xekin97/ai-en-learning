import { normalizeFailure } from "../shared/failure";
import type {
  ActiveRangeModel,
  AppFailure,
  ReviewRangePreviewModel,
} from "../shared/models";
import type { ApiPort } from "../shared/ports";

export interface RangeQuery {
  startDate: string;
  endDate: string;
  timezone: string;
}
export interface RangeDraft {
  startDate: string;
  endDate: string;
  timezone: string | null;
  initialized: boolean;
}
export interface RangeValidation {
  kind: "missing" | "reversed";
  startInvalid: boolean;
  endInvalid: boolean;
}
export type RangePreviewState =
  | { kind: "idle" | "loading" }
  | { kind: "invalid"; issue: RangeValidation }
  | {
      kind: "ready" | "empty";
      query: RangeQuery;
      result: ReviewRangePreviewModel;
    }
  | { kind: "failed"; failure: AppFailure };
export interface ReviewSetupState {
  draft: RangeDraft;
  preview: RangePreviewState;
  resume: {
    status: "idle" | "loading" | "ready" | "failed";
    session: ActiveRangeModel | null;
    failure: AppFailure | null;
  };
  create: {
    status: "idle" | "submitting" | "failed";
    failure: AppFailure | null;
  };
}
export interface RangeVisit {
  readonly id: number;
  readonly epoch: number;
}

export function createReviewSetupState(): ReviewSetupState {
  return {
    draft: { startDate: "", endDate: "", timezone: null, initialized: false },
    preview: { kind: "idle" },
    resume: { status: "idle", session: null, failure: null },
    create: { status: "idle", failure: null },
  };
}
export function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4)),
    month = Number(value.slice(5, 7)),
    day = Number(value.slice(8, 10));
  if (year < 1 || month < 1 || month > 12 || day < 1) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= (days[month - 1] ?? 0);
}
export function validateRange(draft: RangeDraft): RangeValidation | null {
  const startInvalid = !isCalendarDate(draft.startDate),
    endInvalid = !isCalendarDate(draft.endDate);
  if (startInvalid || endInvalid)
    return { kind: "missing", startInvalid, endInvalid };
  return draft.startDate > draft.endDate
    ? { kind: "reversed", startInvalid: false, endInvalid: true }
    : null;
}
export function rangeKey(query: RangeQuery): string {
  return JSON.stringify([query.startDate, query.endDate, query.timezone]);
}
function queryOf(draft: RangeDraft): RangeQuery | null {
  if (!draft.initialized || !draft.timezone || validateRange(draft))
    return null;
  return {
    startDate: draft.startDate,
    endDate: draft.endDate,
    timezone: draft.timezone,
  };
}
export function hasCurrentRangePreview(state: ReviewSetupState): boolean {
  const query = queryOf(state.draft);
  return (
    !!query &&
    state.preview.kind === "ready" &&
    rangeKey(query) === rangeKey(state.preview.query)
  );
}
export function canStartRange(
  state: ReviewSetupState,
  learner: boolean,
): boolean {
  return (
    learner &&
    state.create.status !== "submitting" &&
    hasCurrentRangePreview(state)
  );
}
function localDate(date: Date): string {
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}
export function localSevenDayRange(now: Date, timezone: string): RangeQuery {
  // Calendar subtraction, not elapsed hours: DST days need not be 24 hours.
  const end = new Date(now);
  const start = new Date(now);
  start.setDate(start.getDate() - 6);
  return { startDate: localDate(start), endDate: localDate(end), timezone };
}
function environmentFailure(): AppFailure {
  return {
    kind: "validation",
    code: "browser_timezone_unavailable",
    status: null,
    requestId: null,
    fields: {},
    retryable: true,
  };
}

export function createReviewSetupActions(input: {
  state: () => ReviewSetupState;
  api: Pick<
    ApiPort,
    "previewReviewRange" | "getActiveRange" | "createReviewSession"
  >;
  epoch: () => number;
  isLearner: () => boolean;
  refreshSecurity: () => Promise<void>;
  authenticationRequired: () => void;
}) {
  let visitNumber = 0,
    previewRevision = 0,
    resumeRevision = 0,
    commandRevision = 0;
  let visit: RangeVisit | null = null;
  let abort: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  function current(owner: RangeVisit): boolean {
    return (
      visit === owner && owner.epoch === input.epoch() && input.isLearner()
    );
  }
  function invalidatePreview() {
    previewRevision++;
    abort?.abort();
    abort = null;
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }
  function enter(): RangeVisit {
    invalidatePreview();
    resumeRevision++;
    commandRevision++;
    visit = { id: ++visitNumber, epoch: input.epoch() };
    input.state().preview = { kind: "idle" };
    input.state().create = { status: "idle", failure: null };
    return visit;
  }
  function dispose(owner: RangeVisit) {
    if (visit !== owner) return;
    invalidatePreview();
    resumeRevision++;
    commandRevision++;
    visit = null;
  }
  function unauthorized(failure: AppFailure) {
    if (failure.kind === "authentication_required")
      input.authenticationRequired();
  }
  function initializeBrowser(
    owner: RangeVisit,
    now: Date,
    timezone: string | null,
  ): boolean {
    if (!current(owner)) return false;
    invalidatePreview();
    if (!timezone || !Number.isFinite(now.getTime())) {
      input.state().preview = { kind: "failed", failure: environmentFailure() };
      return false;
    }
    try {
      new Intl.DateTimeFormat("en", { timeZone: timezone });
    } catch {
      input.state().preview = { kind: "failed", failure: environmentFailure() };
      return false;
    }
    const draft = input.state().draft;
    if (!draft.initialized)
      input.state().draft = {
        ...localSevenDayRange(now, timezone),
        initialized: true,
      };
    else draft.timezone = timezone;
    return true;
  }
  async function runPreview(
    owner: RangeVisit,
    revision: number,
    query: RangeQuery,
  ): Promise<void> {
    if (!current(owner) || revision !== previewRevision) return;
    const controller = new AbortController();
    abort = controller;
    const accepts = () =>
      current(owner) &&
      revision === previewRevision &&
      !controller.signal.aborted &&
      rangeKey(query) ===
        rangeKey(
          queryOf(input.state().draft) ?? {
            startDate: "",
            endDate: "",
            timezone: "",
          },
        );
    try {
      const result = await input.api.previewReviewRange(
        query,
        controller.signal,
      );
      if (!accepts()) return;
      input.state().preview = {
        kind: result.empty ? "empty" : "ready",
        query,
        result,
      };
    } catch (error) {
      if (!accepts()) return;
      const failure = normalizeFailure(error);
      input.state().preview = { kind: "failed", failure };
      unauthorized(failure);
    } finally {
      if (abort === controller) abort = null;
    }
  }
  async function preview(owner: RangeVisit, debounce = false): Promise<void> {
    if (!current(owner)) return;
    invalidatePreview();
    const draft = input.state().draft;
    if (!draft.initialized || !draft.timezone) {
      input.state().preview = { kind: "idle" };
      return;
    }
    const issue = validateRange(draft);
    if (issue) {
      input.state().preview = { kind: "invalid", issue };
      return;
    }
    const query = queryOf(draft);
    if (!query) return;
    const revision = previewRevision;
    input.state().preview = { kind: "loading" };
    if (debounce) {
      timer = setTimeout(() => {
        timer = null;
        void runPreview(owner, revision, query);
      }, 250);
    } else await runPreview(owner, revision, query);
  }
  function changeDate(
    owner: RangeVisit,
    field: "startDate" | "endDate",
    value: string,
  ): void {
    if (!current(owner) || input.state().draft[field] === value) return;
    input.state().draft[field] = value;
    // Synchronously invalidates accepted results, including the debounce gap.
    void preview(owner, true);
  }
  async function loadResume(owner: RangeVisit): Promise<void> {
    if (!current(owner)) return;
    const revision = ++resumeRevision;
    input.state().resume = { status: "loading", session: null, failure: null };
    try {
      const session = await input.api.getActiveRange();
      if (!current(owner) || revision !== resumeRevision) return;
      input.state().resume = { status: "ready", session, failure: null };
    } catch (error) {
      if (!current(owner) || revision !== resumeRevision) return;
      const failure = normalizeFailure(error);
      input.state().resume = { status: "failed", session: null, failure };
      unauthorized(failure);
    }
  }
  async function start(owner: RangeVisit): Promise<string | null> {
    if (!current(owner) || !canStartRange(input.state(), input.isLearner()))
      return null;
    const query = queryOf(input.state().draft);
    if (!query) return null;
    const revision = previewRevision,
      command = ++commandRevision;
    input.state().create = { status: "submitting", failure: null };
    let sent = false;
    const ownsCommand = () => current(owner) && command === commandRevision;
    try {
      await input.refreshSecurity();
      if (
        !ownsCommand() ||
        revision !== previewRevision ||
        !hasCurrentRangePreview(input.state()) ||
        rangeKey(query) !==
          rangeKey(
            queryOf(input.state().draft) ?? {
              startDate: "",
              endDate: "",
              timezone: "",
            },
          )
      )
        return null;
      sent = true;
      const outcome = await input.api.createReviewSession({
        mode: "range",
        ...query,
      });
      if (!ownsCommand()) return null;
      // Server reuse/current session wins, even if dates changed after dispatch.
      return outcome.session.sessionId;
    } catch (error) {
      if (!ownsCommand()) return null;
      const failure = normalizeFailure(error);
      input.state().create = { status: "submitting", failure };
      unauthorized(failure);
      if (!current(owner)) return null;
      if (sent) {
        // Never replay an uncertain POST; discover any committed session.
        await loadResume(owner);
        if (ownsCommand()) await preview(owner);
      }
      if (ownsCommand()) input.state().create = { status: "failed", failure };
      return null;
    } finally {
      if (ownsCommand() && input.state().create.status === "submitting")
        input.state().create = { status: "idle", failure: null };
    }
  }
  function resumeTarget(owner: RangeVisit): string | null {
    if (!current(owner) || input.state().resume.status !== "ready") return null;
    return input.state().resume.session?.sessionId ?? null;
  }
  return {
    enter,
    dispose,
    current,
    initializeBrowser,
    changeDate,
    preview,
    loadResume,
    start,
    resumeTarget,
  };
}
