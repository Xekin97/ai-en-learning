import { normalizeFailure } from "@application/shared/failure";
import type {
  AppFailure,
  BatchDetailModel,
  BatchSummaryModel,
  LearningSummaryModel,
} from "@application/shared/models";

interface LibraryState {
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
  const session = useSessionStore();
  const state = usePrivateState<LibraryState>("library", () => ({
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
    state.value.status = "loading";
    state.value.query = query.trim();
    try {
      const [summary, page] = await Promise.all([
        api.getLearningSummary(),
        api.listBatches(state.value.query ? { entry: state.value.query } : {}),
      ]);
      if (epoch !== session.epoch.value) return;
      state.value.summary = summary;
      state.value.batches = page.items;
      state.value.nextCursor = page.nextCursor;
      state.value.hasMore = page.hasMore;
      state.value.failure = null;
      state.value.status = page.items.length ? "ready" : "empty";
    } catch (error) {
      if (epoch !== session.epoch.value) return;
      state.value.failure = normalizeFailure(error);
      if (state.value.failure.kind === "authentication_required")
        session.invalidate();
      state.value.status = "failed";
    }
  }

  async function loadMore(): Promise<void> {
    const epoch = session.epoch.value;
    if (!state.value.hasMore || !state.value.nextCursor) return;
    try {
      const page = await api.listBatches({
        ...(state.value.query ? { entry: state.value.query } : {}),
        cursor: state.value.nextCursor,
      });
      if (epoch !== session.epoch.value) return;
      state.value.batches.push(...page.items);
      state.value.nextCursor = page.nextCursor;
      state.value.hasMore = page.hasMore;
    } catch (error) {
      if (epoch !== session.epoch.value) return;
      state.value.failure = normalizeFailure(error);
      if (state.value.failure.kind === "authentication_required")
        session.invalidate();
    }
  }

  async function loadDetail(batchId: string): Promise<void> {
    const epoch = session.epoch.value;
    if (state.value.details[batchId]) return;
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
      if (epoch !== session.epoch.value) return;
      state.value.batches = state.value.batches.filter(
        (batch) => batch.id !== batchId,
      );
      state.value.details = Object.fromEntries(
        Object.entries(state.value.details).filter(([id]) => id !== batchId),
      );
      state.value.status = state.value.batches.length ? "ready" : "empty";
      const summary = await api.getLearningSummary();
      if (epoch === session.epoch.value) state.value.summary = summary;
    } catch (error) {
      if (epoch !== session.epoch.value) return;
      state.value.failure = normalizeFailure(error);
      if (state.value.failure.kind === "authentication_required")
        session.invalidate();
      throw state.value.failure;
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
    setParticipation,
    remove,
    beginSingleBatch,
  };
}
