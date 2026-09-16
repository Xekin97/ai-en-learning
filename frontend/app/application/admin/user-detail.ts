import type { ApiPort } from "../shared/ports";
import type {
  AdminUserDetailModel,
  AppFailure,
  BatchDetailModel,
  BatchSummaryModel,
  PageModel,
  PlanCode,
} from "../shared/models";
import { normalizeFailure } from "../shared/failure";

export type ReaderState =
  | { kind: "closed" }
  | {
      kind: "loading" | "failed" | "unavailable";
      userId: string;
      batchId: string;
    }
  | { kind: "ready"; userId: string; batchId: string; batch: BatchDetailModel };
export interface AdminDetailState {
  userId: string | null;
  user: AdminUserDetailModel | null;
  status: "idle" | "loading" | "ready" | "failed";
  failure: AppFailure | null;
  library: PageModel<BatchSummaryModel>;
  libraryStatus: "idle" | "loading" | "ready" | "failed";
  libraryFailure: AppFailure | null;
  reader: ReaderState;
  mutation: "idle" | "saving" | "failed";
  mutationFailure: AppFailure | null;
  needsReconciliation: boolean;
}
export function createAdminDetailState(): AdminDetailState {
  return {
    userId: null,
    user: null,
    status: "idle",
    failure: null,
    library: { items: [], nextCursor: null, hasMore: false },
    libraryStatus: "idle",
    libraryFailure: null,
    reader: { kind: "closed" },
    mutation: "idle",
    mutationFailure: null,
    needsReconciliation: false,
  };
}
export type AdminMutationOutcome = { kind: "applied" | "failed" | "ignored" };

// This lifecycle has no Vue/transport/DOM dependency. Aborts are advisory;
// session, target and monotonically increasing revisions decide acceptance.
export function createAdminDetailActions(input: {
  state: () => AdminDetailState;
  replace: (state: AdminDetailState) => void;
  api: Pick<
    ApiPort,
    | "getUser"
    | "listUserBatches"
    | "getUserBatch"
    | "changeUserGroup"
    | "resetUserPassword"
  >;
  sessionEpoch: () => number;
  refreshSecurity: () => Promise<void>;
  authenticationRequired: () => void;
  updateSummary: (user: AdminUserDetailModel) => void;
}) {
  let detailRevision = 0,
    libraryRevision = 0,
    readerRevision = 0,
    mutationRevision = 0;
  let detailAbort: AbortController | null = null,
    readerAbort: AbortController | null = null;
  const current = (id: string, epoch: number) =>
    input.state().userId === id && input.sessionEpoch() === epoch;
  function closeReader() {
    readerRevision++;
    readerAbort?.abort();
    input.state().reader = { kind: "closed" };
  }
  function dispose() {
    detailRevision++;
    libraryRevision++;
    mutationRevision++;
    detailAbort?.abort();
    closeReader();
    input.replace(createAdminDetailState());
  }
  function unauthorized(failure: AppFailure) {
    if (failure.kind !== "authentication_required") return;
    dispose();
    input.authenticationRequired();
  }
  async function readUser(id: string, reconcile = false): Promise<void> {
    if (input.state().mutation === "saving" && !reconcile) return;
    const revision = ++detailRevision,
      epoch = input.sessionEpoch();
    detailAbort?.abort();
    detailAbort = new AbortController();
    const state = input.state();
    state.status = "loading";
    state.user = null;
    state.failure = null;
    try {
      const user = await input.api.getUser(id, detailAbort.signal);
      if (!current(id, epoch) || revision !== detailRevision) return;
      if (user.id !== id) throw contractError();
      Object.assign(input.state(), {
        user,
        status: "ready",
        failure: null,
        needsReconciliation: false,
      });
    } catch (error) {
      if (!current(id, epoch) || revision !== detailRevision) return;
      const failure = normalizeFailure(error);
      Object.assign(input.state(), { user: null, status: "failed", failure });
      unauthorized(failure);
    }
  }
  async function readLibrary(id: string): Promise<void> {
    const revision = ++libraryRevision,
      epoch = input.sessionEpoch();
    input.state().libraryStatus = "loading";
    input.state().libraryFailure = null;
    try {
      const page = await input.api.listUserBatches(id);
      if (!current(id, epoch) || revision !== libraryRevision) return;
      input.state().library = page;
      input.state().libraryStatus = "ready";
    } catch (error) {
      if (!current(id, epoch) || revision !== libraryRevision) return;
      const failure = normalizeFailure(error);
      input.state().libraryStatus = "failed";
      input.state().libraryFailure = failure;
      unauthorized(failure);
    }
  }
  async function load(id: string) {
    dispose();
    input.state().userId = id;
    await Promise.all([readUser(id), readLibrary(id)]);
  }
  async function readBatch(id: string, batchId: string) {
    if (input.state().userId !== id) return;
    const epoch = input.sessionEpoch(),
      revision = ++readerRevision;
    readerAbort?.abort();
    readerAbort = new AbortController();
    input.state().reader = { kind: "loading", userId: id, batchId };
    try {
      const batch = await input.api.getUserBatch(
        id,
        batchId,
        readerAbort.signal,
      );
      if (!current(id, epoch) || revision !== readerRevision) return;
      if (batch.id !== batchId) throw contractError();
      input.state().reader = { kind: "ready", userId: id, batchId, batch };
    } catch (error) {
      if (!current(id, epoch) || revision !== readerRevision) return;
      const failure = normalizeFailure(error);
      input.state().reader = {
        kind: ["not_found", "forbidden"].includes(failure.kind)
          ? "unavailable"
          : "failed",
        userId: id,
        batchId,
      };
      unauthorized(failure);
    }
  }
  async function changeGroup(
    id: string,
    plan: PlanCode,
  ): Promise<AdminMutationOutcome> {
    if (
      input.state().mutation === "saving" ||
      input.state().user?.id !== id ||
      input.state().user?.role !== "learner" ||
      input.state().status !== "ready"
    )
      return { kind: "ignored" };
    const epoch = input.sessionEpoch(),
      revision = ++mutationRevision;
    detailRevision++;
    detailAbort?.abort();
    input.state().mutation = "saving";
    input.state().mutationFailure = null;
    let sent = false;
    try {
      await input.refreshSecurity();
      if (!current(id, epoch) || revision !== mutationRevision)
        return { kind: "ignored" };
      sent = true;
      const result = await input.api.changeUserGroup(id, plan);
      if (!current(id, epoch) || revision !== mutationRevision)
        return { kind: "ignored" };
      if (
        result.user.id !== id ||
        result.user.role !== "learner" ||
        result.user.planCode !== plan ||
        result.quotaReset !== true
      )
        throw contractError();
      Object.assign(input.state(), {
        user: result.user,
        status: "ready",
        mutation: "idle",
        failure: null,
        needsReconciliation: false,
      });
      input.updateSummary(result.user);
      return { kind: "applied" };
    } catch (error) {
      if (!current(id, epoch) || revision !== mutationRevision)
        return { kind: "ignored" };
      const failure = normalizeFailure(error);
      const uncertain =
        sent && (failure.status === null || failure.status >= 500);
      input.state().mutationFailure = failure;
      if (uncertain) {
        input.state().needsReconciliation = true;
        await readUser(id, true); // Never replay the non-idempotent reset.
        if (!current(id, epoch) || revision !== mutationRevision)
          return { kind: "ignored" };
      }
      input.state().mutation = "failed";
      unauthorized(failure);
      return { kind: "failed" }; // Reconciliation is not proof of this PUT.
    }
  }
  async function resetPassword(
    id: string,
    password: string,
    confirmation: string,
  ): Promise<AdminMutationOutcome> {
    if (
      input.state().mutation === "saving" ||
      input.state().user?.role !== "learner" ||
      input.state().user?.id !== id
    )
      return { kind: "ignored" };
    const epoch = input.sessionEpoch(),
      revision = ++mutationRevision;
    input.state().mutation = "saving";
    input.state().mutationFailure = null;
    try {
      await input.refreshSecurity();
      if (!current(id, epoch) || revision !== mutationRevision)
        return { kind: "ignored" };
      await input.api.resetUserPassword(id, password, confirmation);
      if (!current(id, epoch) || revision !== mutationRevision)
        return { kind: "ignored" };
      input.state().mutation = "idle";
      return { kind: "applied" };
    } catch (error) {
      if (!current(id, epoch) || revision !== mutationRevision)
        return { kind: "ignored" };
      const failure = normalizeFailure(error);
      input.state().mutation = "failed";
      input.state().mutationFailure = failure;
      unauthorized(failure);
      return { kind: "failed" };
    }
  }
  return {
    load,
    readUser,
    readLibrary,
    readBatch,
    closeReader,
    changeGroup,
    resetPassword,
    dispose,
  };
}
function contractError() {
  const error = new Error("Invalid user projection");
  error.name = "ContractMappingError";
  return error;
}
