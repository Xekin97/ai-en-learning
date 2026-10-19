import type {
  ConfigPortabilityCategory,
  PortabilityPreview,
} from "@application/admin/config-portability";

export interface PortabilityRecoveryRecord {
  operation_id: string;
  category: ConfigPortabilityCategory;
  preview_token: string;
  commit_not_after: string;
  retain_until: string;
}

const prefix = "wordweave:config-portability:v1:";
const categories = new Set<ConfigPortabilityCategory>([
  "models",
  "plans",
  "items",
  "growth",
]);
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const keyFor = (actorId: string) => prefix + actorId;

export function recoveryFromPreview(
  preview: PortabilityPreview,
): PortabilityRecoveryRecord {
  if (
    !preview.operationId ||
    !preview.previewToken ||
    !preview.commitNotAfter ||
    !preview.retainUntil
  )
    throw new Error("Preview has no recovery ticket");
  return {
    operation_id: preview.operationId,
    category: preview.category,
    preview_token: preview.previewToken,
    commit_not_after: preview.commitNotAfter,
    retain_until: preview.retainUntil,
  };
}

export function savePortabilityRecovery(
  actorId: string,
  record: PortabilityRecoveryRecord,
): void {
  const raw = JSON.stringify(record);
  if (raw.length > 20_000) throw new Error("Recovery record exceeds limit");
  sessionStorage.setItem(keyFor(actorId), raw);
}

export function readPortabilityRecovery(
  actorId: string,
): PortabilityRecoveryRecord | null {
  const raw = sessionStorage.getItem(keyFor(actorId));
  if (!raw) return null;
  if (raw.length > 20_000) {
    sessionStorage.removeItem(keyFor(actorId));
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    sessionStorage.removeItem(keyFor(actorId));
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    sessionStorage.removeItem(keyFor(actorId));
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    Object.keys(record).sort().join(",") !==
      "category,commit_not_after,operation_id,preview_token,retain_until" ||
    typeof record.operation_id !== "string" ||
    !uuid.test(record.operation_id) ||
    typeof record.category !== "string" ||
    !categories.has(record.category as ConfigPortabilityCategory) ||
    typeof record.preview_token !== "string" ||
    record.preview_token.length < 1 ||
    record.preview_token.length > 16384 ||
    typeof record.commit_not_after !== "string" ||
    !Number.isFinite(Date.parse(record.commit_not_after)) ||
    typeof record.retain_until !== "string" ||
    Date.parse(record.retain_until) - Date.parse(record.commit_not_after) !==
      86_400_000
  ) {
    sessionStorage.removeItem(keyFor(actorId));
    return null;
  }
  return record as unknown as PortabilityRecoveryRecord;
}

export function clearPortabilityRecovery(actorId: string): void {
  sessionStorage.removeItem(keyFor(actorId));
}

export function clearAllPortabilityRecovery(): void {
  if (typeof sessionStorage === "undefined") return;
  for (let index = sessionStorage.length - 1; index >= 0; index--) {
    const key = sessionStorage.key(index);
    if (key?.startsWith(prefix)) sessionStorage.removeItem(key);
  }
}
