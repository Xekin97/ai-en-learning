import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  parseCustomParameters,
  type CustomParameterParseResult,
} from "@application/admin/custom-parameters";

const vectors = JSON.parse(
  readFileSync(
    resolve(
      process.cwd(),
      "../.planning/milestones/M002-legacy-M003/technical/fixtures/cr306/compact-byte-vectors.json",
    ),
    "utf8",
  ),
) as {
  accepted: Array<{
    id: string;
    raw: string;
    normalized_json: string;
    bytes: number;
  }>;
  rejected_numbers: Array<{ id: string; token: string; code: string }>;
  size_recipes: Array<{
    id: string;
    key: string;
    repeat: string;
    count: number;
    suffix: string;
    bytes: number;
    accepted: boolean;
  }>;
};

const issue = (result: CustomParameterParseResult) =>
  result.ok ? null : result.issue.code;

describe("CR306 strict custom parameters", () => {
  it.each(vectors.accepted)(
    "uses the shared compact byte vector $id",
    ({ raw, normalized_json, bytes }) => {
      const result = parseCustomParameters(raw);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(JSON.stringify(result.value)).toBe(normalized_json);
      expect(result.compactBytes).toBe(bytes);
    },
  );

  it.each(vectors.size_recipes)(
    "uses the shared size boundary $id",
    ({ key, repeat, count, suffix, bytes, accepted }) => {
      const result = parseCustomParameters(
        JSON.stringify({ [key]: repeat.repeat(count) + suffix }),
      );
      expect(result.ok).toBe(accepted);
      if (result.ok) expect(result.compactBytes).toBe(bytes);
      else expect(result.issue.code).toBe("too_large");
    },
  );

  it.each(vectors.rejected_numbers)(
    "rejects the shared unsafe number $id",
    ({ token, code }) =>
      expect(issue(parseCustomParameters(`{"x":${token}}`))).toBe(code),
  );

  it.each([
    ["", "invalid_json"],
    ["[]", "object_required"],
    ["null", "object_required"],
    ['{"a":1,"a":2}', "duplicate_key"],
    ['{"enabled":1,"\\u0065nabled":2}', "duplicate_key"],
    ['{"maxOutputTokens":3}', "protected_field"],
    ['{"reasoning":{"headers":{}}}', "protected_field"],
    ['{"x":"\\u0000"}', "unsupported_character"],
    ['{"x":"\\uD800"}', "invalid_json"],
    ['{"x":1} trailing', "invalid_json"],
    ['{"x":1\u00a0}', "invalid_json"],
    ['{"x":1\f}', "invalid_json"],
  ])("rejects %s as %s", (raw, code) =>
    expect(issue(parseCustomParameters(raw))).toBe(code),
  );

  it("distinguishes literal backslash text from decoded U+0000", () => {
    const result = parseCustomParameters('{"x":"\\\\u0000"}');
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.x).toBe("\\u0000");
  });

  it("accepts depth eight and rejects depth nine", () => {
    const nested = (depth: number) =>
      "{" + '"x":{'.repeat(depth - 1) + '"leaf":true' + "}".repeat(depth);
    expect(parseCustomParameters(nested(8)).ok).toBe(true);
    expect(issue(parseCustomParameters(nested(9)))).toBe("too_deep");
  });

  it("retains the exact source range and JSON pointer for a duplicate", () => {
    const result = parseCustomParameters(
      '{"reasoning":{"enabled":false,"enabled":true}}',
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.issue).toMatchObject({
      code: "duplicate_key",
      pointer: "/reasoning/enabled",
    });
    expect(result.issue.end).toBeGreaterThan(result.issue.start);
  });
});
