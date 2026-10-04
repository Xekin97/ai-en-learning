import type {
  PresetModel,
  PresetDetailModel,
} from "@application/presets/models";
import type { AppFailure } from "@application/shared/models";
import { normalizeFailure } from "@application/shared/failure";
export function usePresetsStore() {
  const api = useNuxtApp().$api,
    session = useSessionStore();
  const state = usePrivateState("presets", () => ({
    items: [] as PresetModel[],
    detail: null as PresetDetailModel | null,
    nextCursor: null as string | null,
    loaded: false,
    complete: false,
    pending: false,
    failure: null as AppFailure | null,
    request: 0,
  }));
  async function load(all = false, refresh = false) {
    if (state.value.pending) return;
    if (!refresh && state.value.loaded && (!all || state.value.complete))
      return;
    const epoch = session.epoch.value,
      request = ++state.value.request;
    state.value.pending = true;
    state.value.failure = null;
    try {
      let cursor = refresh ? null : state.value.nextCursor;
      const items: PresetModel[] = refresh ? [] : [...state.value.items];
      do {
        const result = await api.listPresets(cursor ?? undefined);
        if (epoch !== session.epoch.value || request !== state.value.request)
          return;
        for (const item of result.items) {
          const index = items.findIndex((existing) => existing.id === item.id);
          if (index < 0) items.push(item);
          else items[index] = item;
        }
        cursor = result.nextCursor;
      } while (all && cursor);
      state.value.items = items;
      state.value.nextCursor = cursor;
      state.value.loaded = true;
      state.value.complete = !cursor;
    } catch (error) {
      if (epoch === session.epoch.value && request === state.value.request)
        state.value.failure = normalizeFailure(error);
    } finally {
      if (epoch === session.epoch.value && request === state.value.request)
        state.value.pending = false;
    }
  }
  async function detail(id: string) {
    const epoch = session.epoch.value,
      request = ++state.value.request;
    state.value.pending = true;
    state.value.failure = null;
    try {
      const value = await api.getPreset(id);
      if (epoch === session.epoch.value && request === state.value.request)
        state.value.detail = value;
    } catch (error) {
      if (epoch === session.epoch.value && request === state.value.request) {
        state.value.failure = normalizeFailure(error);
        state.value.detail = null;
      }
    } finally {
      if (epoch === session.epoch.value && request === state.value.request)
        state.value.pending = false;
    }
  }
  return { state: readonly(state), load, detail };
}
