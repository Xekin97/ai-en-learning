import {
  getPlanGenerationState,
  type AdminPlanDraft,
} from "@application/admin/plan-policy";
import type { Translate } from "@presentation/auth/auth-gate-presenter";

export function presentAdminPlanWarning(
  draft: Readonly<AdminPlanDraft> | undefined,
  t: Translate,
) {
  if (!draft) return null;
  const state = getPlanGenerationState(draft);
  if (state === "available") return null;
  return {
    title: t("admin.planPaused"),
    // The approved options hint does not describe a zero-only quota.
    copy: state === "missing-options" ? t("admin.planResumeOptions") : "",
  };
}
