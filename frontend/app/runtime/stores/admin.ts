import { registerPrivateState } from "@runtime/session/private-state";
import { normalizeFailure } from "@application/shared/failure";
import {
  beginAdminUserAppend,
  beginAdminUserSearch,
  completeAdminUserSearch,
  createAdminUserSearchState,
  failAdminUserAppend,
  failAdminUserSearch,
  isCurrentAdminUserRequest,
  isInvalidAdminUserCursorFailure,
  type AdminUserSearchState,
} from "@application/admin/user-search";
import type {
  AdminModelModel,
  AdminUserDetailModel,
  AppFailure,
  CredentialStatusModel,
  GroupCode,
  GroupPolicyModel,
  PassageLength,
} from "@application/shared/models";

interface AdminState {
  credential: CredentialStatusModel | null;
  models: AdminModelModel[];
  groups: GroupPolicyModel[];
  userSearch: AdminUserSearchState;
  nextModelCursor: string | null;
  status: "idle" | "loading" | "ready" | "saving" | "failed";
  failure: AppFailure | null;
}

export function useAdminStore() {
  const api = useNuxtApp().$api;
  const session = useSessionStore();
  const initial = (): AdminState => ({
    credential: null,
    models: [],
    groups: [],
    userSearch: createAdminUserSearchState(),
    nextModelCursor: null,
    status: "idle",
    failure: null,
  });
  const state = useState<AdminState>("admin", initial);
  registerPrivateState(useNuxtApp(), "admin", state, initial);

  async function loadModels(): Promise<void> {
    await run(async () => {
      const [credential, page] = await Promise.all([
        api.getCredential(),
        api.listModels(),
      ]);
      state.value.credential = credential;
      state.value.models = page.items;
      state.value.nextModelCursor = page.nextCursor;
    });
  }

  async function saveCredential(apiKey: string): Promise<void> {
    await run(async () => {
      state.value.credential = await api.putCredential(apiKey);
    }, true);
  }

  async function createModel(input: {
    displayName: string;
    description: string | null;
    openRouterModelId: string;
  }): Promise<void> {
    await run(async () => {
      state.value.models.unshift(await api.createModel(input));
    }, true);
  }

  async function saveModelDraft(input: {
    modelId: string | null;
    displayName: string;
    description: string | null;
    openRouterModelId: string;
    enabled: boolean;
  }): Promise<void> {
    await run(async () => {
      let model = input.modelId
        ? await api.updateModel(input.modelId, {
            displayName: input.displayName,
            description: input.description,
            openRouterModelId: input.openRouterModelId,
          })
        : await api.createModel({
            displayName: input.displayName,
            description: input.description,
            openRouterModelId: input.openRouterModelId,
          });

      replaceModel(model, !input.modelId);
      if (model.enabled !== input.enabled) {
        model = await api.setModelEnabled(model.id, input.enabled);
        replaceModel(model);
      }
    }, true);
  }

  async function toggleModel(
    model: Pick<AdminModelModel, "id" | "enabled">,
  ): Promise<void> {
    await run(async () => {
      const updated = await api.setModelEnabled(model.id, !model.enabled);
      replaceModel(updated);
    }, true);
  }

  async function updateModel(
    modelId: string,
    input: {
      displayName?: string;
      description?: string | null;
      openRouterModelId?: string;
    },
  ): Promise<void> {
    await run(async () => {
      replaceModel(await api.updateModel(modelId, input));
    }, true);
  }

  function replaceModel(model: AdminModelModel, append = false): void {
    const index = state.value.models.findIndex(
      (candidate) => candidate.id === model.id,
    );
    if (index >= 0) state.value.models[index] = model;
    else if (append) state.value.models.push(model);
  }

  async function loadGroups(): Promise<void> {
    await run(async () => {
      state.value.groups = await api.listGroups();
    });
  }

  async function saveGroup(
    code: GroupCode,
    input: {
      rolling24hLimit: number | null;
      maxEntries: number;
      allowedLengths: PassageLength[];
      modelIds: string[];
    },
  ): Promise<void> {
    await run(async () => {
      const updated = await api.putGroup(code, input);
      const index = state.value.groups.findIndex(
        (group) => group.code === code,
      );
      if (index >= 0) state.value.groups[index] = updated;
    }, true);
  }

  type UserLoadOutcome =
    | {
        kind: "applied";
        mode: "initial" | "append" | "recovery";
        firstNewUserId: string | null;
        hasMore: boolean;
      }
    | { kind: "failed" | "ignored" };

  async function loadUsers(username = ""): Promise<UserLoadOutcome> {
    const sessionEpoch = session.epoch.value;
    const started = beginAdminUserSearch(state.value.userSearch, username);
    state.value.userSearch = started.state;
    try {
      const page = await api.listUsers(
        started.request.query ? { username: started.request.query } : {},
      );
      if (sessionEpoch !== session.epoch.value) return { kind: "ignored" };
      const completed = completeAdminUserSearch(
        state.value.userSearch,
        started.request,
        page,
      );
      state.value.userSearch = completed.state;
      if (!completed.applied) return { kind: "ignored" };
      if (completed.state.resultStatus === "failed") return { kind: "failed" };
      return {
        kind: "applied",
        mode: "initial",
        firstNewUserId: page.items[0]?.id ?? null,
        hasMore: page.hasMore,
      };
    } catch (error) {
      if (sessionEpoch !== session.epoch.value) return { kind: "ignored" };
      const failed = failAdminUserSearch(
        state.value.userSearch,
        started.request,
        normalizeFailure(error),
      );
      state.value.userSearch = failed.state;
      return { kind: failed.applied ? "failed" : "ignored" };
    }
  }

  async function loadMoreUsers(): Promise<UserLoadOutcome> {
    const sessionEpoch = session.epoch.value;
    const started = beginAdminUserAppend(state.value.userSearch);
    if (!started) return { kind: "ignored" };
    state.value.userSearch = started.state;
    try {
      const page = await api.listUsers({
        username: started.request.query,
        cursor: started.request.cursor as string,
      });
      const firstNewUserId = page.items[0]?.id ?? null;
      if (sessionEpoch !== session.epoch.value) return { kind: "ignored" };
      const completed = completeAdminUserSearch(
        state.value.userSearch,
        started.request,
        page,
      );
      state.value.userSearch = completed.state;
      if (!completed.applied) return { kind: "ignored" };
      if (completed.state.appendStatus === "failed") return { kind: "failed" };
      return {
        kind: "applied",
        mode: "append",
        firstNewUserId,
        hasMore: page.hasMore,
      };
    } catch (error) {
      if (sessionEpoch !== session.epoch.value) return { kind: "ignored" };
      const failure = normalizeFailure(error);
      if (
        isCurrentAdminUserRequest(state.value.userSearch, started.request) &&
        isInvalidAdminUserCursorFailure(failure)
      ) {
        return recoverUsersWithoutCursor(started.request.query);
      }
      const failed = failAdminUserAppend(
        state.value.userSearch,
        started.request,
        failure,
      );
      state.value.userSearch = failed.state;
      return { kind: failed.applied ? "failed" : "ignored" };
    }
  }

  async function recoverUsersWithoutCursor(
    username: string,
  ): Promise<UserLoadOutcome> {
    const sessionEpoch = session.epoch.value;
    const recovery = beginAdminUserSearch(state.value.userSearch, username);
    state.value.userSearch = recovery.state;
    try {
      const page = await api.listUsers(
        recovery.request.query ? { username: recovery.request.query } : {},
      );
      if (sessionEpoch !== session.epoch.value) return { kind: "ignored" };
      const completed = completeAdminUserSearch(
        state.value.userSearch,
        recovery.request,
        page,
      );
      state.value.userSearch = completed.state;
      if (!completed.applied) return { kind: "ignored" };
      if (completed.state.resultStatus === "failed") return { kind: "failed" };
      return {
        kind: "applied",
        mode: "recovery",
        firstNewUserId: page.items[0]?.id ?? null,
        hasMore: page.hasMore,
      };
    } catch (error) {
      if (sessionEpoch !== session.epoch.value) return { kind: "ignored" };
      const failed = failAdminUserSearch(
        state.value.userSearch,
        recovery.request,
        normalizeFailure(error),
      );
      state.value.userSearch = failed.state;
      return { kind: failed.applied ? "failed" : "ignored" };
    }
  }

  function resetUserSearch(): void {
    state.value.userSearch = {
      ...createAdminUserSearchState(),
      requestEpoch: state.value.userSearch.requestEpoch + 1,
    };
  }

  function updateUserSummary(user: AdminUserDetailModel) {
    state.value.userSearch.items = state.value.userSearch.items.map((row) =>
      row.id === user.id
        ? {
            ...row,
            role: user.role,
            planCode: user.planCode,
            status: user.status,
          }
        : row,
    );
  }

  async function run(
    operation: () => Promise<void>,
    saving = false,
  ): Promise<void> {
    state.value.status = saving ? "saving" : "loading";
    try {
      if (saving) await session.refreshSecurityContext();
      await operation();
      state.value.failure = null;
      state.value.status = "ready";
    } catch (error) {
      state.value.failure = normalizeFailure(error);
      state.value.status = "failed";
      if (saving) throw state.value.failure;
    }
  }

  return {
    state: readonly(state),
    loadModels,
    saveCredential,
    createModel,
    saveModelDraft,
    toggleModel,
    updateModel,
    loadGroups,
    saveGroup,
    loadUsers,
    loadMoreUsers,
    resetUserSearch,
    updateUserSummary,
  };
}
