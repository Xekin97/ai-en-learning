import { describe, expect, it } from "vitest";
import {
  ContractMappingError,
  mapCodePointSpansToSegments,
  mergePassageOccurrences,
} from "@infrastructure/http/mappers/span-mapper";

describe("code-point span mapping", () => {
  it("maps offsets after a supplementary Unicode character", () => {
    expect(
      mapCodePointSpansToSegments("🙂 adapt and adapted", [
        { start: 2, end: 7, surface: "adapt" },
        { start: 12, end: 19, surface: "adapted" },
      ]),
    ).toEqual([
      { kind: "text", text: "🙂 " },
      { kind: "target", text: "adapt" },
      { kind: "text", text: " and " },
      { kind: "target", text: "adapted" },
    ]);
  });

  it("preserves every blank in a repeated hint phrase", () => {
    expect(
      mapCodePointSpansToSegments("adapt to adapt quickly", [
        { start: 0, end: 5 },
        { start: 9, end: 14 },
      ]).filter((segment) => segment.kind === "target"),
    ).toHaveLength(2);
  });

  it("rejects collisions between target occurrences", () => {
    expect(() =>
      mergePassageOccurrences("adapted", [
        [{ start: 0, end: 7, surface: "adapted" }],
        [{ start: 2, end: 5, surface: "apt" }],
      ]),
    ).toThrow(ContractMappingError);
  });
});
