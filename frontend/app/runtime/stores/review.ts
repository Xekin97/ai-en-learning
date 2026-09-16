import { normalizeFailure } from "@application/shared/failure";
import {
  hasStablePassageTopology,
  passageTopologyError,
} from "@application/review/topology";
import type {
  AppFailure,
  ReviewAnswerModel,
  ReviewAttemptModel,
  ReviewSessionModel,
} from "@application/shared/models";

interface ReviewState {
  session: ReviewSessionModel | null;
  singleBatchSources: Record<string, string>;
  incorrectBlankIds: string[];
  incorrect: boolean;
  status: "idle" | "loading" | "ready" | "submitting" | "completed" | "failed";
  failure: AppFailure | null;
}

export function useReviewStore() {
  const api = useNuxtApp().$api;
  const sessionStore = useSessionStore();
  // Attempts contain transient question relationships and must never enter the
  // SSR-serialized Nuxt state tree.
  const attempt = shallowRef<ReviewAttemptModel | null>(null);
  const state = usePrivateState<ReviewState>("review", () => {
    return {
      session: null,
      singleBatchSources: {},
      incorrectBlankIds: [],
      incorrect: false,
      status: "idle",
      failure: null,
    };
  });

  watch(
    sessionStore.epoch,
    () => {
      attempt.value = null;
    },
    { flush: "sync" },
  );

  async function loadSession(
    sessionId: string,
    sourceBatchId: string | null = null,
  ): Promise<void> {
    const epoch = sessionStore.epoch.value;
    state.value.status = "loading";
    try {
      const session = await api.getReviewSession(sessionId);
      if (epoch !== sessionStore.epoch.value) return;
      state.value.session = session;
      if (session.mode === "single_batch") {
        const batchId =
          session.status === "active"
            ? session.currentBatch.batchId
            : sourceBatchId;
        if (batchId)
          state.value.singleBatchSources[session.sessionId] = batchId;
      }
      attempt.value = null;
      state.value.incorrect = false;
      state.value.status =
        session.status === "completed" ? "completed" : "ready";
      state.value.failure = null;
    } catch (error) {
      if (epoch !== sessionStore.epoch.value) return;
      state.value.failure = normalizeFailure(error);
      if (state.value.failure.kind === "authentication_required")
        sessionStore.invalidate();
      state.value.status = "failed";
    }
  }

  async function ensureAttempt(): Promise<void> {
    if (
      state.value.session?.status !== "active" ||
      attempt.value ||
      !sessionStore.isLearner.value
    )
      return;
    const epoch = sessionStore.epoch.value,
      sessionId = state.value.session.sessionId;
    try {
      await sessionStore.refreshSecurityContext();
      if (epoch !== sessionStore.epoch.value || !sessionStore.isLearner.value)
        return;
      const nextAttempt = await api.startReviewAttempt(sessionId);
      if (
        epoch !== sessionStore.epoch.value ||
        state.value.session?.sessionId !== sessionId
      )
        return;
      attempt.value = nextAttempt;
      state.value.status = "ready";
    } catch (error) {
      if (epoch !== sessionStore.epoch.value) return;
      state.value.failure = normalizeFailure(error);
      if (state.value.failure.kind === "authentication_required")
        sessionStore.invalidate();
      state.value.status = "failed";
    }
  }

  async function act(answer: ReviewAnswerModel): Promise<void> {
    const epoch = sessionStore.epoch.value;
    if (!attempt.value) return;
    const activeAttempt = attempt.value;
    state.value.status = "submitting";
    try {
      await sessionStore.refreshSecurityContext();
      if (epoch !== sessionStore.epoch.value) return;
      const outcome = await api.actOnReview(activeAttempt.attemptId, answer);
      if (
        epoch !== sessionStore.epoch.value ||
        attempt.value?.attemptId !== activeAttempt.attemptId
      )
        return;
      state.value.incorrectBlankIds =
        outcome.outcome === "retry" ? (outcome.incorrectBlankIds ?? []) : [];
      state.value.incorrect = outcome.outcome === "retry";
      if (outcome.outcome === "retry" || outcome.outcome === "advanced") {
        if (
          outcome.outcome === "retry" &&
          attempt.value.item.stage === "passage_cloze" &&
          !hasStablePassageTopology(attempt.value.item, outcome.item)
        )
          throw passageTopologyError();
        attempt.value = {
          ...attempt.value,
          item: outcome.item,
          progress: outcome.progress,
        };
        state.value.status = "ready";
        return;
      }
      if (outcome.outcome === "session_completed") {
        if (state.value.session) {
          if (state.value.session.mode === "single_batch")
            state.value.singleBatchSources[state.value.session.sessionId] =
              outcome.batchResult.batchId;
          state.value.session = {
            sessionId: state.value.session.sessionId,
            mode: state.value.session.mode,
            status: "completed",
            dateRange: state.value.session.dateRange,
            progress: outcome.sessionProgress,
            currentBatch: null,
            summary: outcome.sessionSummary,
          };
        }
        attempt.value = null;
        state.value.status = "completed";
        return;
      }
      if (state.value.session?.status === "active") {
        state.value.session = {
          ...state.value.session,
          progress: outcome.sessionProgress,
          currentBatch: outcome.nextBatch,
        };
      }
      attempt.value = null;
      await ensureAttempt();
    } catch (error) {
      if (epoch !== sessionStore.epoch.value) return;
      state.value.failure = normalizeFailure(error);
      if (state.value.failure.kind === "authentication_required")
        sessionStore.invalidate();
      state.value.status = "failed";
    }
  }

  async function restartCompletedSession(): Promise<string | null> {
    const epoch = sessionStore.epoch.value;
    const completed = state.value.session;
    if (!completed || completed.status !== "completed") return null;
    state.value.status = "submitting";
    try {
      await sessionStore.refreshSecurityContext();
      if (epoch !== sessionStore.epoch.value) return null;
      let result;
      if (completed.mode === "single_batch") {
        const sourceBatchId =
          state.value.singleBatchSources[completed.sessionId];
        if (!sourceBatchId) {
          state.value.status = "completed";
          return null;
        }
        result = await api.createReviewSession({
          mode: "single_batch",
          batchId: sourceBatchId,
        });
      } else {
        if (!completed.dateRange) {
          state.value.status = "completed";
          return null;
        }
        result = await api.createReviewSession({
          mode: "range",
          startDate: completed.dateRange.startDate,
          endDate: completed.dateRange.endDate,
          timezone: completed.dateRange.timezone,
        });
      }
      if (epoch !== sessionStore.epoch.value) return null;
      state.value.session = result.session;
      if (result.session.mode === "single_batch")
        state.value.singleBatchSources[result.session.sessionId] =
          result.session.currentBatch.batchId;
      attempt.value = null;
      state.value.incorrectBlankIds = [];
      state.value.incorrect = false;
      state.value.failure = null;
      state.value.status = "ready";
      return result.session.sessionId;
    } catch (error) {
      if (epoch !== sessionStore.epoch.value) return null;
      state.value.failure = normalizeFailure(error);
      if (state.value.failure.kind === "authentication_required")
        sessionStore.invalidate();
      state.value.status = "failed";
      return null;
    }
  }

  return {
    state: readonly(state),
    attempt: readonly(attempt),
    loadSession,
    ensureAttempt,
    act,
    restartCompletedSession,
  };
}
