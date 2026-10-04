import { reviewDrafts } from "@infrastructure/storage/review-drafts";
import { normalizeFailure } from "@application/shared/failure";
import type {
  AppFailure,
  BatchDetailModel,
  BatchSummaryModel,
  LearningSummaryModel,
} from "@application/shared/models";

interface LibraryState {
  request: number;
  summaryRequest: number;
  loadingMore: boolean;
  summary: LearningSummaryModel | null;
  batches: BatchSummaryModel[];
  nextCursor: string | null;
  hasMore: boolean;
  query: string;
  status: "idle" | "loading" | "ready" | "empty" | "failed";
  failure: AppFailure | null;
  details: Record<string, BatchDetailModel>;
}

export function useLibraryStore() {
  const api = useNuxtApp().$api;
  const session = useSessionStore(),
    feedback = useFeedbackStore();
  const state = usePrivateState<LibraryState>("library", () => ({
    request: 0,
    summaryRequest: 0,
    loadingMore: false,
    summary: null,
    batches: [],
    nextCursor: null,
    hasMore: false,
    query: "",
    status: "idle",
    failure: null,
    details: {},
  }));

  async function load(query = state.value.query): Promise<void> {
    const epoch = session.epoch.value;
    const request = ++state.value.request;
    const summaryRequest = ++state.value.summaryRequest;
    state.value.status = "loading";
    state.value.query = query.trim();
    try {
      const [summary, page] = await Promise.all([
        api.getLearningSummary(),
        api.listBatches(state.value.query ? { entry: state.value.query } : {}),
      ]);
      if (epoch !== session.epoch.value || request !== state.value.request)
        return;
      if (summaryRequest === state.value.summaryRequest)
        state.value.summary = summary;
      state.value.batches = page.items;
      state.value.nextCursor = page.nextCursor;
      state.value.hasMore = page.hasMore;
      state.value.failure = null;
      state.value.status = page.items.length ? "ready" : "empty";
    } catch (error) {
      if (epoch !== session.epoch.value || request !== state.value.request)
        return;
      state.value.failure = normalizeFailure(error);
      if (state.value.failure.kind === "authentication_required")
        session.invalidate();
      state.value.status = "failed";
    }
  }

  async function loadMore(): Promise<void> {
    const epoch = session.epoch.value;
    if (
      !state.value.hasMore ||
      !state.value.nextCursor ||
      state.value.loadingMore
    )
      return;
    state.value.loadingMore = true;
    const request = state.value.request;
    try {
      const page = await api.listBatches({
        ...(state.value.query ? { entry: state.value.query } : {}),
        cursor: state.value.nextCursor,
      });
      if (epoch !== session.epoch.value || request !== state.value.request)
        return;
      state.value.batches.push(
        ...page.items.filter(
          (item) =>
            !state.value.batches.some((existing) => existing.id === item.id),
        ),
      );
      state.value.nextCursor = page.nextCursor;
      state.value.hasMore = page.hasMore;
      state.value.failure = null;
    } catch (error) {
      if (epoch !== session.epoch.value || request !== state.value.request)
        return;
      state.value.failure = normalizeFailure(error);
      if (state.value.failure.kind === "authentication_required")
        session.invalidate();
    } finally {
      if (epoch === session.epoch.value) state.value.loadingMore = false;
    }
  }

  async function loadDetail(batchId: string, force = false): Promise<void> {
    const epoch = session.epoch.value;
    if (!force && state.value.details[batchId]) return;
    try {
      const batch = await api.getBatch(batchId);
      if (epoch !== session.epoch.value) return;
      state.value.details[batchId] = batch;
    } catch (error) {
      if (epoch !== session.epoch.value) return;
      state.value.failure = normalizeFailure(error);
      if (state.value.failure.kind === "authentication_required")
        session.invalidate();
    }
  }

  async function setParticipation(
    batchId: string,
    participates: boolean,
  ): Promise<void> {
    const epoch = session.epoch.value;
    try {
      await session.refreshSecurityContext();
      if (epoch !== session.epoch.value) return;
      const updated = await api.setBatchParticipation(batchId, participates);
      if (epoch !== session.epoch.value) return;
      const summary = state.value.batches.find((batch) => batch.id === batchId);
      if (summary) summary.participatesInRangeReview = updated;
      const detail = state.value.details[batchId];
      if (detail) detail.participatesInRangeReview = updated;
      const summaryRequest = ++state.value.summaryRequest;
      const learningSummary = await api.getLearningSummary();
      if (
        epoch === session.epoch.value &&
        summaryRequest === state.value.summaryRequest
      ) {
        state.value.summary = learningSummary;
        state.value.failure = null;
      }
    } catch (error) {
      if (epoch !== session.epoch.value) return;
      state.value.failure = normalizeFailure(error);
      if (state.value.failure.kind === "authentication_required")
        session.invalidate();
      throw state.value.failure;
    }
  }

  async function remove(batchId: string): Promise<void> {
    const epoch = session.epoch.value;
    try {
      await session.refreshSecurityContext();
      if (epoch !== session.epoch.value) return;
      await api.deleteBatch(batchId);
      const owner =
        session.actor.value?.kind === "account" ? session.actor.value.id : null;
      if (owner && import.meta.client) {
        try {
          for (const key of await reviewDrafts.keys(owner)) {
            if (epoch !== session.epoch.value) break;
            try {
              await api.getReviewAttempt(key[2]);
            } catch (error) {
              if (normalizeFailure(error).status === 404)
                await reviewDrafts.remove(key);
            }
          }
        } catch {
          feedback.show("failed");
        }
      }
      if (epoch !== session.epoch.value) return;
      state.value.batches = state.value.batches.filter(
        (batch) => batch.id !== batchId,
      );
      state.value.details = Object.fromEntries(
        Object.entries(state.value.details).filter(([id]) => id !== batchId),
      );
      state.value.status = state.value.batches.length ? "ready" : "empty";
      const summaryRequest = ++state.value.summaryRequest;
      const summary = await api.getLearningSummary();
      if (
        epoch === session.epoch.value &&
        summaryRequest === state.value.summaryRequest
      )
        state.value.summary = summary;
    } catch (error) {
      if (epoch !== session.epoch.value) return;
      state.value.failure = normalizeFailure(error);
      if (state.value.failure.kind === "authentication_required")
        session.invalidate();
      throw state.value.failure;
    }
  }

  async function updateTitle(
    batchId: string,
    title: string,
    expectedTitleRevision: string,
  ): Promise<boolean> {
    const epoch = session.epoch.value;
    try {
      await session.refreshSecurityContext();
      if (epoch !== session.epoch.value) return false;
      const updated = await api.updateBatchTitle(batchId, {
        title,
        expectedTitleRevision,
      });
      if (epoch !== session.epoch.value) return false;
      const detail = state.value.details[batchId];
      if (detail) {
        detail.title = updated.title;
        detail.titleRevision = updated.titleRevision;
      }
      const item = state.value.batches.find((item) => item.id === batchId);
      if (item) {
        item.title = updated.title;
        item.titleRevision = updated.titleRevision;
      }
      state.value.failure = null;
      return true;
    } catch (error) {
      if (epoch === session.epoch.value) {
        state.value.failure = normalizeFailure(error);
        if (
          state.value.failure.kind === "conflict" ||
          state.value.failure.status === null ||
          (state.value.failure.status ?? 0) >= 500
        )
          await loadDetail(batchId, true);
      }
      return false;
    }
  }
  async function beginSingleBatch(batchId: string): Promise<string> {
    const epoch = session.epoch.value;
    await session.refreshSecurityContext();
    if (epoch !== session.epoch.value) throw new Error("Session changed");
    const result = await api.createReviewSession({
      mode: "single_batch",
      batchId,
    });
    if (epoch !== session.epoch.value) throw new Error("Session changed");
    return result.session.sessionId;
  }

  return {
    state: readonly(state),
    load,
    loadMore,
    loadDetail,
    updateTitle,
    setParticipation,
    remove,
    beginSingleBatch,
  };
}
