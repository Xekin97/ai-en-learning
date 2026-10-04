import {
  createVocabularySearch,
  type VocabularySearchState,
} from "@application/generation/vocabulary-search";
export function useVocabularySearch() {
  const api = useNuxtApp().$api,
    session = useSessionStore();
  const state = ref<VocabularySearchState>({
    query: "",
    candidates: [],
    searchStatus: "idle",
  });
  const search = createVocabularySearch(
    (q, signal) => api.searchVocabulary(q, signal),
    () => session.epoch.value,
    (next) => {
      state.value = next;
    },
  );
  watch(session.epoch, () => search.reset(), { flush: "sync" });
  onScopeDispose(() => search.reset());
  return { state: readonly(state), ...search };
}
