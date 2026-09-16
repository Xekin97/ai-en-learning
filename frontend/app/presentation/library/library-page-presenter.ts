export type LibraryPageStatus =
  "idle" | "loading" | "ready" | "empty" | "failed";

export interface LibraryPageViewModel {
  isFirstEmpty: boolean;
  isSearchEmpty: boolean;
  showCollection: boolean;
  showLoading: boolean;
  showBatches: boolean;
}

export function presentLibraryPage(input: {
  status: LibraryPageStatus;
  query: string;
  batchCount: number;
}): LibraryPageViewModel {
  const hasQuery = input.query.trim().length > 0;
  const isEmpty = input.status === "empty" && input.batchCount === 0;
  const isFirstEmpty = isEmpty && !hasQuery;

  return {
    isFirstEmpty,
    isSearchEmpty: isEmpty && hasQuery,
    showCollection: !isFirstEmpty,
    showLoading: input.status === "loading",
    showBatches: input.batchCount > 0,
  };
}
