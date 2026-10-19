import type { AppFailure } from "@application/shared/models";
import type { CustomParameterIssueCode } from "@application/admin/custom-parameters";

export interface SubmittedModelKey {
  key: string;
  modelId: string | null;
}

const localCodes = new Set<CustomParameterIssueCode>([
  "invalid_json",
  "duplicate_key",
  "object_required",
  "protected_field",
  "too_deep",
  "too_large",
  "number_out_of_range",
  "unsupported_character",
]);

export function customParameterCopyKey(code: string) {
  const normalized =
    code === "controlled_field_conflict"
      ? "protected_field"
      : code === "required"
        ? "invalid_json"
        : code;
  return localCodes.has(normalized as CustomParameterIssueCode)
    ? `cr306.error.${normalized}`
    : null;
}

export function locateCustomParameterErrors(
  failure: AppFailure,
  submitted: readonly SubmittedModelKey[],
  probeTarget?: SubmittedModelKey,
) {
  const entries: Record<string, string> = {};
  let formCode: string | null =
    failure.code === "request_too_large" ? "request_too_large" : null;
  for (const [field, code] of Object.entries(failure.fields)) {
    if (!field) {
      formCode ??= code;
      continue;
    }
    const parts = decodePointer(field);
    if (!parts) {
      formCode ??= code;
      continue;
    }
    if (parts[0] === "custom_parameters" && probeTarget) {
      entries[probeTarget.key] ??= code;
      continue;
    }
    if (
      parts[0] === "models" &&
      /^\d+$/.test(parts[1] ?? "") &&
      parts[2] === "custom_parameters"
    ) {
      const row = submitted[Number(parts[1])];
      if (row) entries[row.key] ??= code;
      else formCode ??= code;
      continue;
    }
    formCode ??= code;
  }
  return { entries, formCode };
}

function decodePointer(pointer: string) {
  if (!pointer.startsWith("/")) return null;
  const result: string[] = [];
  for (const raw of pointer.slice(1).split("/")) {
    if (/~(?![01])/u.test(raw)) return null;
    result.push(raw.replaceAll("~1", "/").replaceAll("~0", "~"));
  }
  return result;
}
