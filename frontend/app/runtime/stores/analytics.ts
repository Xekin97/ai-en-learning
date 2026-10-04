import type {
  OverviewModel,
  TrafficModel,
  FunnelModel,
  RetentionModel,
} from "@application/analytics/models";
import type { AppFailure } from "@application/shared/models";
import { normalizeFailure } from "@application/shared/failure";
export function useAnalyticsStore() {
  const api = useNuxtApp().$api,
    session = useSessionStore();
  const state = usePrivateState("analytics", () => ({
    overview: null as OverviewModel | null,
    traffic: null as TrafficModel | null,
    funnel: null as FunnelModel | null,
    retention: null as RetentionModel | null,
    failures: {} as Partial<
      Record<"overview" | "traffic" | "funnel" | "retention", AppFailure>
    >,
    pending: false,
    request: 0,
    period: 7 as 7 | 30,
  }));
  async function loadOverview() {
    const epoch = session.epoch.value,
      request = ++state.value.request;
    state.value.pending = true;
    try {
      const value = await api.getOverview();
      if (epoch !== session.epoch.value || request !== state.value.request)
        return;
      state.value.overview = value;
      delete state.value.failures.overview;
    } catch (error) {
      if (epoch === session.epoch.value && request === state.value.request)
        state.value.failures.overview = normalizeFailure(error);
    } finally {
      if (epoch === session.epoch.value && request === state.value.request)
        state.value.pending = false;
    }
  }
  async function load(period: 7 | 30 = 7) {
    if (!state.value.overview) await loadOverview();
    const end = state.value.overview?.learningDay;
    if (!end) return;
    const start = new Date(end + "T00:00:00Z");
    start.setUTCDate(start.getUTCDate() - period + 1);
    const startDay = start.toISOString().slice(0, 10),
      epoch = session.epoch.value,
      request = ++state.value.request;
    state.value.pending = true;
    state.value.period = period;
    state.value.traffic = state.value.funnel = state.value.retention = null;
    const results = await Promise.allSettled([
      api.getTraffic(startDay, end),
      api.getFunnel(startDay, end),
      api.getRetention(startDay, end),
    ]);
    if (epoch !== session.epoch.value || request !== state.value.request)
      return;
    const [traffic, funnel, retention] = results;
    if (traffic.status === "fulfilled") {
      state.value.traffic = traffic.value;
      delete state.value.failures.traffic;
    } else state.value.failures.traffic = normalizeFailure(traffic.reason);
    if (funnel.status === "fulfilled") {
      state.value.funnel = funnel.value;
      delete state.value.failures.funnel;
    } else state.value.failures.funnel = normalizeFailure(funnel.reason);
    if (retention.status === "fulfilled") {
      state.value.retention = retention.value;
      delete state.value.failures.retention;
    } else state.value.failures.retention = normalizeFailure(retention.reason);
    state.value.pending = false;
  }
  return { state: readonly(state), loadOverview, load };
}
