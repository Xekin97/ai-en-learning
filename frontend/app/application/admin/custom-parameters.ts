import type { JsonObject } from "@application/shared/models";

type RuntimeJsonPrimitive = null | boolean | number | string;
type RuntimeJsonValue =
  RuntimeJsonPrimitive | RuntimeJsonValue[] | RuntimeJsonObject;
type RuntimeJsonObject = { [key: string]: RuntimeJsonValue };

export type CustomParameterIssueCode =
  | "invalid_json"
  | "duplicate_key"
  | "object_required"
  | "protected_field"
  | "too_deep"
  | "too_large"
  | "number_out_of_range"
  | "unsupported_character";

export interface CustomParameterIssue {
  code: CustomParameterIssueCode;
  pointer: string;
  start: number;
  end: number;
}

export type CustomParameterParseResult =
  | { ok: true; value: JsonObject; compactBytes: number }
  | { ok: false; issue: CustomParameterIssue };

export const CUSTOM_PARAMETERS_MAX_BYTES = 16_384;
export const CUSTOM_PARAMETERS_MAX_DEPTH = 8;

const topLevelProtected = new Set(
  [
    "model",
    "models",
    "route",
    "router",
    "provider",
    "model_id",
    "provider_model_id",
    "messages",
    "input",
    "instructions",
    "system",
    "prompt",
    "conversation",
    "previous_response_id",
    "stream",
    "stream_options",
    "background",
    "async",
    "store",
    "include",
    "response_format",
    "text",
    "output_format",
    "output_config",
    "schema",
    "json_schema",
    "structured_outputs",
    "max_tokens",
    "max_output_tokens",
    "max_completion_tokens",
    "max_new_tokens",
    "output_mode",
    "tools",
    "tool_choice",
    "functions",
    "function_call",
    "parallel_tool_calls",
    "plugins",
    "n",
    "best_of",
    "extra_body",
    "body",
    "request",
    "request_body",
    "payload",
    "query",
    "extra_query",
  ].map(normalizeKey),
);

const protectedAtEveryLevel = new Set(
  [
    "api_key",
    "authorization",
    "headers",
    "extra_headers",
    "base_url",
    "api_base",
    "endpoint",
    "url",
    "api_version",
    "access_token",
    "bearer_token",
    "secret",
    "__proto__",
    "prototype",
    "constructor",
  ].map(normalizeKey),
);

function normalizeKey(value: string) {
  return value
    .toLocaleLowerCase("en-US")
    .replaceAll("_", "")
    .replaceAll("-", "");
}

function pointerPart(value: string) {
  return value.replaceAll("~", "~0").replaceAll("/", "~1");
}

class ParseFailure {
  constructor(readonly issue: CustomParameterIssue) {}
}

class Parser {
  private index = 0;

  constructor(private readonly source: string) {}

  parse(): CustomParameterParseResult {
    try {
      this.space();
      if (this.index === this.source.length)
        return this.failure("invalid_json", "", 0, 0);
      const start = this.index;
      const value = this.value(1, "");
      this.space();
      if (this.index !== this.source.length)
        return this.failure("invalid_json", "", this.index, this.index + 1);
      if (!isJsonObject(value))
        return this.failure("object_required", "", start, this.index);
      const compactBytes = new TextEncoder().encode(
        JSON.stringify(value),
      ).byteLength;
      if (compactBytes > CUSTOM_PARAMETERS_MAX_BYTES)
        return this.failure("too_large", "", start, this.index);
      return { ok: true, value: value as JsonObject, compactBytes };
    } catch (error) {
      if (error instanceof ParseFailure)
        return { ok: false, issue: error.issue };
      return this.failure("invalid_json", "", this.index, this.index + 1);
    }
  }

  private value(depth: number, pointer: string): RuntimeJsonValue {
    this.space();
    const char = this.source[this.index];
    if (char === "{") return this.object(depth, pointer);
    if (char === "[") return this.array(depth, pointer);
    if (char === '"') return this.stringValue(pointer);
    if (char === "t") return this.literal("true", true, pointer);
    if (char === "f") return this.literal("false", false, pointer);
    if (char === "n") return this.literal("null", null, pointer);
    if (char === "-" || (char !== undefined && char >= "0" && char <= "9"))
      return this.number(pointer);
    this.raise("invalid_json", pointer, this.index, this.index + 1);
  }

  private object(depth: number, pointer: string): RuntimeJsonObject {
    const start = this.index;
    if (depth > CUSTOM_PARAMETERS_MAX_DEPTH)
      this.raise("too_deep", pointer, start, start + 1);
    this.index++;
    this.space();
    const result = Object.create(null) as RuntimeJsonObject;
    const keys = new Set<string>();
    if (this.source[this.index] === "}") {
      this.index++;
      return result;
    }
    while (this.index < this.source.length) {
      this.space();
      const keyStart = this.index;
      if (this.source[this.index] !== '"')
        this.raise("invalid_json", pointer, keyStart, keyStart + 1);
      const key = this.string(pointer);
      const childPointer = `${pointer}/${pointerPart(key)}`;
      if (key.includes("\u0000"))
        this.raise("unsupported_character", pointer, keyStart, this.index);
      if (keys.has(key))
        this.raise("duplicate_key", childPointer, keyStart, this.index);
      keys.add(key);
      const normalized = normalizeKey(key);
      if (
        protectedAtEveryLevel.has(normalized) ||
        (depth === 1 && topLevelProtected.has(normalized))
      )
        this.raise("protected_field", childPointer, keyStart, this.index);
      this.space();
      if (this.source[this.index] !== ":")
        this.raise("invalid_json", childPointer, this.index, this.index + 1);
      this.index++;
      result[key] = this.value(depth + 1, childPointer);
      this.space();
      const separator = this.source[this.index++];
      if (separator === "}") return result;
      if (separator !== ",")
        this.raise("invalid_json", pointer, this.index - 1, this.index);
    }
    this.raise("invalid_json", pointer, start, this.index);
  }

  private array(depth: number, pointer: string): RuntimeJsonValue[] {
    const start = this.index;
    if (depth > CUSTOM_PARAMETERS_MAX_DEPTH)
      this.raise("too_deep", pointer, start, start + 1);
    this.index++;
    this.space();
    const result: RuntimeJsonValue[] = [];
    if (this.source[this.index] === "]") {
      this.index++;
      return result;
    }
    while (this.index < this.source.length) {
      const childPointer = `${pointer}/${result.length}`;
      result.push(this.value(depth + 1, childPointer));
      this.space();
      const separator = this.source[this.index++];
      if (separator === "]") return result;
      if (separator !== ",")
        this.raise("invalid_json", pointer, this.index - 1, this.index);
    }
    this.raise("invalid_json", pointer, start, this.index);
  }

  private stringValue(pointer: string) {
    const start = this.index;
    const value = this.string(pointer);
    if (value.includes("\u0000"))
      this.raise("unsupported_character", pointer, start, this.index);
    return value;
  }

  private string(pointer: string): string {
    const start = this.index++;
    let escaped = false;
    while (this.index < this.source.length) {
      const code = this.source.charCodeAt(this.index);
      if (!escaped && code === 0x22) {
        this.index++;
        const token = this.source.slice(start, this.index);
        let decoded: string;
        try {
          decoded = JSON.parse(token) as string;
        } catch {
          this.raise("invalid_json", pointer, start, this.index);
        }
        for (let i = 0; i < decoded.length; i++) {
          const unit = decoded.charCodeAt(i);
          if (unit >= 0xd800 && unit <= 0xdbff) {
            const low = decoded.charCodeAt(i + 1);
            if (!(low >= 0xdc00 && low <= 0xdfff))
              this.raise("invalid_json", pointer, start, this.index);
            i++;
          } else if (unit >= 0xdc00 && unit <= 0xdfff) {
            this.raise("invalid_json", pointer, start, this.index);
          }
        }
        return decoded;
      }
      if (!escaped && code < 0x20)
        this.raise("invalid_json", pointer, this.index, this.index + 1);
      if (escaped) {
        if (code === 0x75) {
          const hex = this.source.slice(this.index + 1, this.index + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex))
            this.raise("invalid_json", pointer, this.index - 1, this.index + 5);
          this.index += 5;
        } else {
          if (!'"\\/bfnrt'.includes(this.source[this.index] ?? ""))
            this.raise("invalid_json", pointer, this.index - 1, this.index + 1);
          this.index++;
        }
        escaped = false;
        continue;
      }
      if (code === 0x5c) {
        escaped = true;
        this.index++;
        continue;
      }
      this.index++;
    }
    this.raise("invalid_json", pointer, start, this.index || start + 1);
  }

  private number(pointer: string): number {
    const start = this.index;
    const tail = this.source.slice(start);
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(tail);
    if (!match) this.raise("invalid_json", pointer, start, start + 1);
    const token = match[0];
    this.index += token.length;
    const next = this.source[this.index];
    if (next && !/[ \t\r\n,}\]]/.test(next))
      this.raise("invalid_json", pointer, start, this.index + 1);
    if (isMathematicalInteger(token)) {
      const integer = integerValue(token);
      if (integer > 9_007_199_254_740_991n || integer < -9_007_199_254_740_991n)
        this.raise("number_out_of_range", pointer, start, this.index);
    }
    const value = Number(token);
    if (
      !Number.isFinite(value) ||
      (Number.isInteger(value) && !Number.isSafeInteger(value))
    )
      this.raise("number_out_of_range", pointer, start, this.index);
    return value;
  }

  private literal<T extends RuntimeJsonPrimitive>(
    token: string,
    value: T,
    pointer: string,
  ): T {
    const start = this.index;
    if (this.source.slice(start, start + token.length) !== token)
      this.raise("invalid_json", pointer, start, start + token.length);
    this.index += token.length;
    return value;
  }

  private space() {
    while (" \t\r\n".includes(this.source[this.index] ?? "\u0000"))
      this.index++;
  }

  private raise(
    code: CustomParameterIssueCode,
    pointer: string,
    start: number,
    end: number,
  ): never {
    throw new ParseFailure({
      code,
      pointer,
      start: Math.max(0, Math.min(start, this.source.length)),
      end: Math.max(start, Math.min(end, this.source.length)),
    });
  }

  private failure(
    code: CustomParameterIssueCode,
    pointer: string,
    start: number,
    end: number,
  ): CustomParameterParseResult {
    return { ok: false, issue: { code, pointer, start, end } };
  }
}

function parts(token: string) {
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token);
  if (!match) throw new Error("invalid number token");
  return {
    negative: match[1] === "-",
    digits: (match[2] ?? "") + (match[3] ?? ""),
    scale: Number(match[4] ?? "0") - (match[3]?.length ?? 0),
  };
}

function isMathematicalInteger(token: string) {
  const value = parts(token);
  if (value.scale >= 0) return true;
  const fractionalDigits = -value.scale;
  return (
    fractionalDigits <= value.digits.length &&
    value.digits
      .slice(-fractionalDigits)
      .split("")
      .every((digit) => digit === "0")
  );
}

function integerValue(token: string) {
  const value = parts(token);
  let digits = value.digits.replace(/^0+(?=\d)/, "");
  if (value.scale >= 0) digits += "0".repeat(value.scale);
  else digits = digits.slice(0, digits.length + value.scale) || "0";
  const result = BigInt(digits);
  return value.negative ? -result : result;
}

function isJsonObject(value: RuntimeJsonValue): value is RuntimeJsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseCustomParameters(raw: string): CustomParameterParseResult {
  return new Parser(raw).parse();
}

export function requireCustomParameters(raw: string): JsonObject {
  const parsed = parseCustomParameters(raw);
  if (!parsed.ok) throw new ParseFailure(parsed.issue);
  return parsed.value;
}

export function formatCustomParameters(value: JsonObject) {
  return JSON.stringify(value, null, 2);
}
