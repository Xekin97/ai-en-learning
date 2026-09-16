import { describe, expect, it } from "vitest";
import { retainAvailableSelection } from "@application/generation/selection";

describe("generation selection availability", () => {
  it("does not choose an option for a new task", () => {
    expect(retainAvailableSelection(null, ["first", "second"])).toBeNull();
  });

  it("keeps an explicit selection while it remains available", () => {
    expect(retainAvailableSelection("second", ["first", "second"])).toBe(
      "second",
    );
  });

  it("clears an explicit selection when it is no longer available", () => {
    expect(retainAvailableSelection("second", ["first"])).toBeNull();
  });
});
