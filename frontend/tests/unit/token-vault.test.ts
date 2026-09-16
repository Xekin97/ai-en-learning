import { describe, expect, it } from "vitest";
import { TokenVault } from "@runtime/session/token-vault";

describe("token vault", () => {
  it("keeps capabilities out of serialization", () => {
    const vault = new TokenVault();
    vault.setCsrf("csrf-secret");
    vault.setGeneration("run-1", "generation-secret");
    vault.setClaim("claim-secret");
    vault.setAttempt("attempt-1", "attempt-secret");
    expect(JSON.stringify(vault)).toBe("{}");
  });

  it("clears all capabilities on sign-out", () => {
    const vault = new TokenVault();
    vault.setCsrf("csrf-secret");
    vault.setGeneration("run-1", "generation-secret");
    vault.clearAll();
    expect(() => vault.csrf()).toThrow();
    expect(() => vault.generation("run-1")).toThrow();
  });
});
