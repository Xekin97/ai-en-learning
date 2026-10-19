import type { AppFailure, FailureKind } from "@application/shared/models";
import { isAppFailure, normalizeFailure } from "@application/shared/failure";
import type { ProblemDto } from "../schemas/common";

const failureKinds: Record<string, FailureKind> = {
  authentication_required: "authentication_required",
  invalid_credentials: "invalid_credentials",
  forbidden: "forbidden",
  csrf_failed: "csrf_failed",
  validation_failed: "validation",
  invalid_json: "validation",
  custom_parameter_conflict: "validation",
  request_too_large: "validation",
  model_request_rejected: "validation",
  malformed_request: "validation",
  quota_exhausted: "quota_exhausted",
  rate_limited: "quota_exhausted",
  generation_in_progress: "generation_in_progress",
  generation_unavailable: "generation_unavailable",
  generation_busy: "service_unavailable",
  model_incompatible: "generation_unavailable",
  provider_unavailable: "generation_unavailable",
  not_found: "not_found",
  capability_expired: "capability_expired",
  conflict: "conflict",
  revision_conflict: "conflict",
  state_conflict: "conflict",
  idempotency_conflict: "conflict",
  temporarily_unavailable: "service_unavailable",
  service_unavailable: "service_unavailable",
  internal_error: "service_unavailable",
};

export function mapProblemDto(dto: ProblemDto): AppFailure {
  const busy = dto.code === "generation_busy" ? dto.context : undefined;
  const unaccepted =
    dto.code === "generation_unavailable" && dto.context?.accepted === false;
  return {
    kind: failureKinds[dto.code] ?? "unknown",
    code: dto.code,
    status: dto.status,
    requestId: dto.request_id,
    fields: Object.fromEntries(
      (dto.field_errors ?? []).map((field) => [field.field, field.code]),
    ),
    retryable: dto.status >= 500 || dto.status === 429,
    ...(busy || unaccepted
      ? {
          accepted: false as const,
          ...(busy
            ? { retryAfterSeconds: busy.retry_after_seconds as number }
            : {}),
        }
      : {}),
  };
}

export function mapUnknownFailure(error: unknown): AppFailure {
  return normalizeFailure(error);
}

export { isAppFailure };
