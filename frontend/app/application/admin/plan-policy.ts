import type { PassageLength } from "@application/shared/models";

export interface AdminPlanDraft {
  rolling24hLimit: string | number;
  maxEntries: number;
  allowedLengths: PassageLength[];
  modelIds: string[];
}

export type PlanGenerationState =
  "available" | "missing-options" | "zero-quota";

// Derived from the editable application model, never the transport DTO.
// An empty limit is the existing Unlimited form value, not a numeric zero.
export function getPlanGenerationState(
  draft: Readonly<AdminPlanDraft>,
): PlanGenerationState {
  if (!draft.modelIds.length || !draft.allowedLengths.length)
    return "missing-options";
  if (
    String(draft.rolling24hLimit).trim() !== "" &&
    Number(draft.rolling24hLimit) === 0
  )
    return "zero-quota";
  return "available";
}
