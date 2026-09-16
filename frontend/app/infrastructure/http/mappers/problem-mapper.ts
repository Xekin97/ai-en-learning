import type { AppFailure, FailureKind } from "@application/shared/models";
import { isAppFailure, normalizeFailure } from "@application/shared/failure";
import type { ProblemDto } from "../schemas/common";

const failureKinds: Record<string, FailureKind> = {
  authentication_required: "authentication_required",
  invalid_credentials: "invalid_credentials",
  forbidden: "forbidden",
  csrf_failed: "csrf_failed",
  validation_failed: "validation",
  malformed_request: "validation",
  quota_exhausted: "quota_exhausted",
  rate_limited: "quota_exhausted",
  generation_in_progress: "generation_in_progress",
  generation_unavailable: "generation_unavailable",
  model_incompatible: "generation_unavailable",
  provider_unavailable: "generation_unavailable",
  not_found: "not_found",
  capability_expired: "capability_expired",
  conflict: "conflict",
  service_unavailable: "service_unavailable",
  internal_error: "service_unavailable",
};

export function mapProblemDto(dto: ProblemDto): AppFailure {
  return {
    kind: failureKinds[dto.code] ?? "unknown",
    code: dto.code,
    status: dto.status,
    requestId: dto.request_id,
    fields: Object.fromEntries(
      (dto.field_errors ?? []).map((field) => [field.field, field.code]),
    ),
    retryable: dto.status >= 500 || dto.status === 429,
  };
}

export function mapUnknownFailure(error: unknown): AppFailure {
  return normalizeFailure(error);
}

export { isAppFailure };
