import { describe, expect, it } from "vitest";
import { safeReturnIntent } from "@application/auth/return-intent";

describe("safe return intent", () => {
  it("accepts learner routes and preserves their query", () => {
    expect(safeReturnIntent("/library")?.href).toBe("/library");
    expect(safeReturnIntent("/review/session-1?batch=batch-1")?.href).toBe(
      "/review/session-1?batch=batch-1",
    );
  });

  it.each([
    "https://attacker.invalid/library",
    "//attacker.invalid/library",
    "/admin/models",
    "/create",
    "/%2f%2fattacker.invalid",
    "/library\\attacker",
    "/library/../account",
    "/library/%2e%2e",
    "/review/a/extra",
    "/account/extra",
    "/library/%252fsecret",
    "/review/a?batch=x&batch=y",
  ])("rejects unsafe or unauthorized target %s", (value) => {
    expect(safeReturnIntent(value)).toBeNull();
  });
});
