import type { AppFailure } from "./models";

export function isAppFailure(value: unknown): value is AppFailure {
  return (
    typeof value === "object" &&
    value !== null &&
    "kind" in value &&
    "code" in value &&
    "retryable" in value
  );
}

export function normalizeFailure(error: unknown): AppFailure {
  if (isAppFailure(error)) return error;
  if (
    error instanceof Error &&
    (error.name === "ContractMappingError" ||
      error.name === "ZodError" ||
      error.name === "SyntaxError")
  ) {
    return failure("contract_violation", "contract_violation", true);
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return failure("network", "aborted", true);
  }
  return failure("network", "network_error", true);
}

function failure(
  kind: AppFailure["kind"],
  code: string,
  retryable: boolean,
): AppFailure {
  return { kind, code, status: null, requestId: null, fields: {}, retryable };
}
