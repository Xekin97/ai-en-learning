import type {
  GrowthModel,
  AchievementModel,
  LevelAwardModel,
  CheckinModel,
} from "@application/growth/models";
import type { AppFailure } from "@application/shared/models";
import { normalizeFailure } from "@application/shared/failure";
const intents = new WeakMap<object, Map<string, string>>();
export function useGrowthStore() {
  const app = useNuxtApp(),
    api = app.$api,
    session = useSessionStore(),
    feedback = useFeedbackStore();
  if (!intents.has(app)) intents.set(app, new Map());
  const keys = intents.get(app)!;
  const state = usePrivateState("growth", () => ({
    growth: null as GrowthModel | null,
    achievements: [] as AchievementModel[],
    levels: [] as LevelAwardModel[],
    calendar: null as CheckinModel | null,
    pending: false,
    claiming: null as string | null,
    failure: null as AppFailure | null,
    request: 0,
  }));
  async function load() {
    const epoch = session.epoch.value,
      request = ++state.value.request;
    state.value.pending = true;
    state.value.failure = null;
    try {
      const growth = await api.getGrowth();
      if (epoch !== session.epoch.value || request !== state.value.request)
        return;
      const achievements: AchievementModel[] = [],
        levels: LevelAwardModel[] = [];
      let cursor: string | undefined;
      do {
        const page = await api.listAchievements(cursor);
        if (epoch !== session.epoch.value || request !== state.value.request)
          return;
        achievements.push(...page.items);
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      do {
        const page = await api.listLevelRewards(cursor);
        if (epoch !== session.epoch.value || request !== state.value.request)
          return;
        levels.push(...page.items);
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
      const end = growth.learningDay,
        start = new Date(end + "T00:00:00Z");
      start.setUTCDate(start.getUTCDate() - 6);
      const calendar = await api.getCheckins(
        start.toISOString().slice(0, 10),
        end,
      );
      if (epoch !== session.epoch.value || request !== state.value.request)
        return;
      state.value.growth = growth;
      state.value.achievements = achievements;
      state.value.levels = levels;
      state.value.calendar = calendar;
    } catch (error) {
      if (epoch === session.epoch.value && request === state.value.request)
        state.value.failure = normalizeFailure(error);
    } finally {
      if (epoch === session.epoch.value && request === state.value.request)
        state.value.pending = false;
    }
  }
  async function claim(kind: "level" | "achievement", id: string) {
    if (state.value.claiming) return;
    const epoch = session.epoch.value,
      intent = `${epoch}:${kind}:${id}`;
    if (!keys.has(intent)) keys.set(intent, crypto.randomUUID());
    state.value.claiming = id;
    try {
      await session.refreshSecurityContext();
      if (epoch !== session.epoch.value) return;
      await api.claimReward(kind, id, keys.get(intent)!);
      if (epoch !== session.epoch.value) return;
      keys.delete(intent);
      feedback.show("claim.ok");
      await load();
    } catch (error) {
      if (epoch !== session.epoch.value) return;
      const failure = normalizeFailure(error);
      await load();
      if (epoch !== session.epoch.value) return;
      state.value.failure = failure;
      feedback.show("failed");
    } finally {
      if (epoch === session.epoch.value) state.value.claiming = null;
    }
  }
  return { state: readonly(state), load, claim };
}
