import type {
  GroupDraft,
  ModelRemovalImpact,
  GroupImpact,
} from "@application/admin/configuration";
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
  ModelConnectionModel,
  ModelConfigurationInput,
  ModelBatchConfigurationInput,
  AdminProviderModel,
  ProviderConfigurationInput,
  GroupCode,
  GroupPolicyModel,
} from "@application/shared/models";

interface AdminState {
  providers: AdminProviderModel[];
  connections: ModelConnectionModel[];
  modelRevision: string;
  models: AdminModelModel[];
  groups: GroupPolicyModel[];
  userSearch: AdminUserSearchState;
  nextModelCursor: string | null;
  status: "idle" | "loading" | "ready" | "saving" | "failed";
  failure: AppFailure | null;
  request: number;
  lastSavedModelId: string | null;
}

export function useAdminStore() {
  const api = useNuxtApp().$api;
  const session = useSessionStore(),
    feedback = useFeedbackStore();
  const initial = (): AdminState => ({
    providers: [],
    connections: [],
    modelRevision: "",
    models: [],
    groups: [],
    userSearch: createAdminUserSearchState(),
    nextModelCursor: null,
    status: "idle",
    failure: null,
    request: 0,
    lastSavedModelId: null,
  });
  const state = useState<AdminState>("admin", initial);
  registerPrivateState(useNuxtApp(), "admin", state, initial);

  async function loadModelProviders() {
    await run(async (accept) => {
      const result = await api.listModelProviders();
      if (!accept()) return;
      state.value.providers = result.items;
      state.value.connections = result.items.map((p) => p.connection);
      state.value.models = result.items.flatMap((p) => p.models);
      state.value.modelRevision = result.revision;
      state.value.nextModelCursor = null;
    });
  }
  async function saveModelProvider(
    id: string | null,
    input: ProviderConfigurationInput,
  ) {
    await run(async (accept) => {
      const result = await api.saveModelProvider(id, input);
      if (!accept()) return;
      const index = state.value.providers.findIndex(
        (p) => p.connection.id === result.provider.connection.id,
      );
      if (index >= 0) state.value.providers[index] = result.provider;
      else state.value.providers.push(result.provider);
      state.value.connections = state.value.providers.map((p) => p.connection);
      state.value.models = state.value.providers.flatMap((p) => p.models);
      state.value.modelRevision = result.revision;
    }, true);
  }
  async function loadModels(more = false): Promise<void> {
    await run(async (accept) => {
      const [connections, page] = await Promise.all([
        api.listModelConnections(),
        api.listModels(
          more ? (state.value.nextModelCursor ?? undefined) : undefined,
        ),
      ]);
      if (!accept()) return;
      state.value.connections = connections;
      state.value.modelRevision = page.revision;
      state.value.models = more
        ? [...state.value.models, ...page.items]
        : page.items;
      state.value.nextModelCursor = page.nextCursor;
    });
  }
  async function ensureModels(ids: readonly string[]): Promise<void> {
    const missing = () =>
      ids.some((id) => !state.value.models.some((model) => model.id === id));
    if (!missing()) return;
    await run(async (accept) => {
      let cursor = state.value.models.length
        ? state.value.nextModelCursor
        : undefined;
      const seen = new Set<string | undefined>();
      let restarted = false,
        replace = false;
      const restart = () => {
        cursor = undefined;
        restarted = true;
        replace = true;
        seen.clear();
      };
      while (missing()) {
        if (cursor === null && !restarted) restart();
        if (cursor === null || seen.has(cursor))
          throw new Error("Referenced models could not be loaded");
        seen.add(cursor);
        let page;
        try {
          page = await api.listModels(cursor);
        } catch (error) {
          if (!accept()) return;
          const failure = normalizeFailure(error);
          const staleCursor =
            (failure.status === 409 && failure.code === "revision_conflict") ||
            (failure.status === 422 &&
              failure.code === "validation_failed" &&
              failure.fields.cursor === "invalid");
          if (cursor && !restarted && staleCursor) {
            restart();
            continue;
          }
          throw error;
        }
        if (!accept()) return;
        state.value.models = [
          ...new Map(
            [...(replace ? [] : state.value.models), ...page.items].map(
              (model) => [model.id, model],
            ),
          ).values(),
        ];
        state.value.nextModelCursor = page.nextCursor;
        replace = false;
        cursor = page.nextCursor;
      }
    });
  }
  async function saveModelDraft(
    input: ModelConfigurationInput & { modelId: string | null },
  ) {
    await run(async (accept) => {
      state.value.lastSavedModelId = null;
      const model = input.modelId
        ? await api.updateModel(input.modelId, input, input.expectedRevision)
        : await api.createModel(input);
      if (!accept()) return;
      replaceModel(model, !input.modelId);
      state.value.lastSavedModelId = model.id;
      state.value.modelRevision = model.revision;
    }, true);
  }
  async function saveModelBatch(input: ModelBatchConfigurationInput) {
    await run(async (accept) => {
      state.value.lastSavedModelId = null;
      const result = await api.createModels(input);
      if (!accept()) return;
      for (const model of result.items) replaceModel(model, true);
      state.value.modelRevision = result.revision;
      state.value.lastSavedModelId = result.items[0]?.id ?? null;
    }, true);
  }
  async function testModelConnection(input: ModelConfigurationInput) {
    await session.refreshSecurityContext();
    await api.testModelConnection(input);
  }
  function replaceModel(model: AdminModelModel, append = false) {
    const index = state.value.models.findIndex((m) => m.id === model.id);
    if (index >= 0) state.value.models[index] = model;
    else if (append) state.value.models.push(model);
  }
  async function loadGroups() {
    await run(async (accept) => {
      const groups = await api.listGroups();
      if (accept()) state.value.groups = groups;
    });
  }
  async function saveGroup(code: GroupCode, input: GroupDraft) {
    await run(async (accept) => {
      const updated = await api.putGroup(code, input);
      if (accept()) {
        const index = state.value.groups.findIndex((g) => g.code === code);
        if (index >= 0) state.value.groups[index] = updated;
      }
    }, true);
  }
  async function previewGroup(code: GroupCode, input: GroupDraft) {
    let result: GroupImpact | null = null;
    await run(async (accept) => {
      await session.refreshSecurityContext();
      if (!accept()) return;
      const value = await api.previewGroup(code, input);
      if (accept()) result = value;
    });
    return result;
  }
  async function previewRemoval(id: string) {
    let result: ModelRemovalImpact | null = null;
    await run(async (accept) => {
      const value = await api.previewModelRemoval(id);
      if (accept()) result = value;
    });
    return result;
  }
  async function removeModel(id: string, revision: string) {
    await run(async (accept) => {
      const model = await api.removeModel(id, revision);
      if (accept()) replaceModel(model);
    }, true);
  }
  function clearRemoval(id: string) {
    api.clearModelRemoval(id);
  }
  async function previewPriorities(
    priorities: { code: GroupCode; priority: number }[],
    revision: string,
  ) {
    let result: Awaited<ReturnType<typeof api.previewPriorities>> | null = null;
    await run(async (accept) => {
      await session.refreshSecurityContext();
      if (!accept()) return;
      const value = await api.previewPriorities(priorities, revision);
      if (accept()) result = value;
    });
    return result;
  }
  async function savePriorities(
    priorities: { code: GroupCode; priority: number }[],
    revision: string,
  ) {
    await run(async (accept) => {
      const groups = await api.savePriorities(priorities, revision);
      if (accept()) state.value.groups = groups;
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
    operation: (accept: () => boolean) => Promise<void>,
    saving = false,
  ) {
    const epoch = session.epoch.value,
      request = ++state.value.request,
      accept = () =>
        epoch === session.epoch.value && request === state.value.request;
    state.value.status = saving ? "saving" : "loading";
    state.value.failure = null;
    try {
      if (saving) await session.refreshSecurityContext();
      if (!accept()) return;
      await operation(accept);
      if (!accept()) return;
      state.value.status = "ready";
      if (saving) feedback.show("saved");
    } catch (error) {
      if (!accept()) return;
      const failure = normalizeFailure(error);
      state.value.failure = failure;
      state.value.status = "failed";
      if (failure.status === 401) session.invalidate();
      if (saving) {
        feedback.show("failed");
        throw failure;
      }
    }
  }

  return {
    state: readonly(state),
    loadModels,
    loadModelProviders,
    saveModelProvider,
    ensureModels,
    saveModelDraft,
    saveModelBatch,
    testModelConnection,
    loadGroups,
    saveGroup,
    previewGroup,
    previewRemoval,
    removeModel,
    clearRemoval,
    previewPriorities,
    savePriorities,
    loadUsers,
    loadMoreUsers,
    resetUserSearch,
    updateUserSummary,
  };
}
