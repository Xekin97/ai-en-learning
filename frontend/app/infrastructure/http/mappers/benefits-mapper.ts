import type {
  EffectModel,
  OwnedItemModel,
  ShopItemModel,
  ActivationPreviewModel,
} from "@application/benefits/models";
import type {
  EffectDto,
  OwnedItemDto,
  ShopItemDto,
  ActivationPreviewDto,
} from "../schemas/benefits";
export function mapEffect(d: EffectDto): EffectModel {
  switch (d.kind) {
    case "makeup":
      return { kind: "makeup" };
    case "extra_credit":
      return { kind: d.kind, extraCount: d.extra_count };
    case "model_trial":
      return {
        kind: d.kind,
        models: d.models.map((m) => ({
          id: m.id,
          name: m.name,
          status: m.status,
        })),
        trialSeconds: d.trial_seconds,
        retirementPoints: d.retirement_points,
      };
    case "plan_trial":
      return {
        kind: d.kind,
        targetPlanCode: d.target_plan_code,
        trialSeconds: d.trial_seconds,
      };
  }
}
export function mapOwnedItem(d: OwnedItemDto): OwnedItemModel {
  return {
    id: d.id,
    definitionId: d.definition_id,
    name: d.name,
    description: d.description,
    kind: d.kind,
    effect: mapEffect(d.effect),
    issuedAt: d.issued_at,
    activationDeadline: d.activation_deadline,
    activatedAt: d.activated_at,
    state: d.state,
    useBlock: d.use_block,
    modelTimes: d.model_times.map((m) => ({
      modelId: m.model_id,
      name: m.name,
      contributionStartsAt: m.contribution_starts_at,
      contributionEndsAt: m.contribution_ends_at,
      aggregateEndsAt: m.aggregate_ends_at,
    })),
    planTrial: d.plan_trial
      ? { planCode: d.plan_trial.plan_code, endsAt: d.plan_trial.ends_at }
      : null,
    extraCredit: d.extra_credit
      ? {
          remaining: d.extra_credit.remaining,
          expiresAt: d.extra_credit.expires_at,
        }
      : null,
    refund: d.refund
      ? { eligibleAt: d.refund.eligible_at, points: d.refund.points }
      : null,
    refundedAt: d.refunded_at,
    refundReceiptId: d.refund_receipt_id,
  };
}
export function mapShopItem(d: ShopItemDto): ShopItemModel {
  return {
    id: d.id,
    name: d.name,
    description: d.description,
    kind: d.kind,
    price: d.price,
    activationTtlSeconds: d.activation_ttl_seconds,
    effect: mapEffect(d.effect),
    available: d.available,
    unavailableReason: d.unavailable_reason,
  };
}
export function mapActivation(d: ActivationPreviewDto): ActivationPreviewModel {
  return {
    canActivate: d.can_activate,
    reason: d.reason,
    effect: mapEffect(d.effect),
    modelTimes: d.model_times.map((m) => ({
      modelId: m.model_id,
      addedSeconds: m.added_seconds,
      resultEndsAt: m.result_ends_at,
    })),
    planResult: d.plan_result
      ? {
          planCode: d.plan_result.plan_code,
          resultEndsAt: d.plan_result.result_ends_at,
        }
      : null,
    discardedTrial: d.discarded_trial
      ? {
          planCode: d.discarded_trial.plan_code,
          endsAt: d.discarded_trial.ends_at,
          remainingSeconds: d.discarded_trial.remaining_seconds,
        }
      : null,
    extraResult: d.extra_result
      ? {
          addedCount: d.extra_result.added_count,
          expiresAt: d.extra_result.expires_at,
        }
      : null,
    tokenExpiresAt: d.token_expires_at,
  };
}
