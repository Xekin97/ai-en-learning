import { describe, expect, it } from "vitest";
import { presentLibraryPage } from "@presentation/library/library-page-presenter";

describe("library page presenter", () => {
  it("treats an empty unfiltered library as a page-level first-use state", () => {
    expect(
      presentLibraryPage({ status: "empty", query: "", batchCount: 0 }),
    ).toEqual({
      isFirstEmpty: true,
      isSearchEmpty: false,
      showCollection: false,
      showLoading: false,
      showBatches: false,
    });
  });

  it("keeps the collection chrome for a search with no matches", () => {
    const view = presentLibraryPage({
      status: "empty",
      query: " absentword ",
      batchCount: 0,
    });
    expect(view.isFirstEmpty).toBe(false);
    expect(view.isSearchEmpty).toBe(true);
    expect(view.showCollection).toBe(true);
  });

  it("does not mistake loading or failed data for an empty library", () => {
    for (const status of ["loading", "failed"] as const) {
      const view = presentLibraryPage({ status, query: "", batchCount: 0 });
      expect(view.isFirstEmpty).toBe(false);
      expect(view.isSearchEmpty).toBe(false);
      expect(view.showCollection).toBe(true);
    }
  });
});
