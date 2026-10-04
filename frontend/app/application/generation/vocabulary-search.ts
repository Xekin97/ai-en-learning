export interface VocabularySearchState {
  query: string;
  candidates: string[];
  searchStatus: "idle" | "loading" | "ready" | "empty" | "failed";
}
// One search instance per workspace/editor. Invalidate before debounce, not after.
export function createVocabularySearch(
  searchPort: (
    query: string,
    signal: AbortSignal,
  ) => Promise<{ entries: string[] }>,
  epoch: () => number,
  update: (state: VocabularySearchState) => void,
) {
  let sequence = 0,
    controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  function reset(query = "") {
    clearTimeout(timer);
    controller?.abort();
    controller = null;
    sequence++;
    update({
      query,
      candidates: [],
      searchStatus: query.trim() ? "loading" : "idle",
    });
  }
  async function search(query: string) {
    reset(query);
    if (!query.trim()) return;
    const request = sequence,
      owner = epoch(),
      abort = new AbortController();
    controller = abort;
    try {
      const result = await searchPort(query.trim(), abort.signal);
      if (request !== sequence || owner !== epoch() || abort.signal.aborted)
        return;
      update({
        query,
        candidates: result.entries,
        searchStatus: result.entries.length ? "ready" : "empty",
      });
    } catch {
      if (request !== sequence || owner !== epoch() || abort.signal.aborted)
        return;
      update({ query, candidates: [], searchStatus: "failed" });
    }
  }
  function setQuery(query: string) {
    reset(query);
    if (query.trim()) timer = setTimeout(() => void search(query), 180);
  }
  return { search, setQuery, reset };
}
