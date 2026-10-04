import type { AchievementKind } from "@application/growth/models";
import type {
  GrowthSettingsModel,
  LevelConfigurationModel,
  AchievementConfigurationModel,
  GrowthSettingsInput,
  LevelChangesModel,
  AchievementChangesModel,
} from "@application/admin/growth";
import type { AppFailure } from "@application/shared/models";
import { normalizeFailure } from "@application/shared/failure";
export const achievementKinds: AchievementKind[] = [
  "checkin_streak",
  "review_streak",
  "mastered_words",
  "saved_passages",
];
export function useAdminGrowthStore() {
  const api = useNuxtApp().$api,
    session = useSessionStore(),
    feedback = useFeedbackStore();
  const state = usePrivateState("admin-growth", () => ({
    settings: null as GrowthSettingsModel | null,
    levels: null as LevelConfigurationModel | null,
    achievements: {} as Partial<
      Record<AchievementKind, AchievementConfigurationModel>
    >,
    failures: {} as Partial<
      Record<"settings" | "levels" | AchievementKind, AppFailure>
    >,
    pending: false,
    request: 0,
    readRequests: {} as Record<string, number>,
  }));
  async function read(resource: "settings" | "levels" | AchievementKind) {
    const epoch = session.epoch.value,
      sequence = (state.value.readRequests[resource] ?? 0) + 1;
    state.value.readRequests[resource] = sequence;
    const current = () =>
      epoch === session.epoch.value &&
      state.value.readRequests[resource] === sequence;
    try {
      if (resource === "settings") {
        const value = await api.getGrowthSettings();
        if (current()) state.value.settings = value;
      } else if (resource === "levels") {
        const value = await api.getLevelConfiguration();
        if (current()) state.value.levels = value;
      } else {
        const value = await api.getAchievementConfiguration(resource);
        if (current()) state.value.achievements[resource] = value;
      }
      if (current()) Reflect.deleteProperty(state.value.failures, resource);
    } catch (error) {
      if (current()) state.value.failures[resource] = normalizeFailure(error);
    }
  }
  async function load() {
    const epoch = session.epoch.value,
      request = ++state.value.request;
    state.value.pending = true;
    await Promise.allSettled(
      ["settings", "levels", ...achievementKinds].map((r) =>
        read(r as "settings" | "levels" | AchievementKind),
      ),
    );
    if (epoch === session.epoch.value && request === state.value.request)
      state.value.pending = false;
  }
  async function execute<T>(operation: () => Promise<T>, success = false) {
    const epoch = session.epoch.value;
    try {
      await session.refreshSecurityContext();
      if (epoch !== session.epoch.value) return null;
      const value = await operation();
      if (epoch !== session.epoch.value) return null;
      if (success) feedback.show("saved");
      return value;
    } catch (error) {
      if (epoch !== session.epoch.value) return null;
      const failure = normalizeFailure(error);
      if (failure.status === 401) session.invalidate();
      feedback.show("failed");
      throw failure;
    }
  }
  async function saveSettings(input: GrowthSettingsInput) {
    const value = await execute(() => api.saveGrowthSettings(input), true);
    if (value) {
      state.value.readRequests.settings =
        (state.value.readRequests.settings ?? 0) + 1;
      state.value.settings = value;
    }
    return value;
  }
  async function saveLevels(input: LevelChangesModel) {
    const value = await execute(() => api.saveLevelChanges(input), true);
    if (value) {
      state.value.readRequests.levels =
        (state.value.readRequests.levels ?? 0) + 1;
      state.value.levels = value.configuration;
    }
    return value;
  }
  async function saveAchievements(input: AchievementChangesModel) {
    const value = await execute(() => api.saveAchievementChanges(input), true);
    if (value) {
      state.value.readRequests[input.kind] =
        (state.value.readRequests[input.kind] ?? 0) + 1;
      state.value.achievements[input.kind] = value.configuration;
    }
    return value;
  }
  return {
    state: readonly(state),
    load,
    read,
    saveSettings,
    saveLevels,
    saveAchievements,
    previewLevels: (input: LevelChangesModel) =>
      execute(() => api.previewLevelChanges(input)),
    clearLevelPreview: () => api.clearLevelPreview(),
  };
}
