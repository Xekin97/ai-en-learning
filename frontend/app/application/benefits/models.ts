import type { ItemKind, SettlementModel } from "../growth/models";
import type { PageModel, GroupCode } from "../shared/models";
export type EffectModel =
  | { kind: "makeup" }
  | { kind: "extra_credit"; extraCount: number }
  | {
      kind: "model_trial";
      models: {
        id: string;
        name: string;
        status: "enabled" | "disabled" | "retired";
      }[];
      trialSeconds: number;
      retirementPoints: string;
    }
  | {
      kind: "plan_trial";
      targetPlanCode: Exclude<GroupCode, "visitor">;
      trialSeconds: number;
    };
export type ItemBlock =
  | "expired"
  | "already_used"
  | "already_refunded"
  | "model_unavailable"
  | "plan_already_covers_models"
  | "plan_not_above_base"
  | "lower_than_current_trial"
  | "invalid_target_day"
  | "day_already_checked_in"
  | "configuration_invalid";
export interface ShopItemModel {
  id: string;
  name: string;
  description: string;
  kind: ItemKind;
  price: string;
  activationTtlSeconds: number;
  effect: EffectModel;
  available: boolean;
  unavailableReason: ItemBlock | null;
}
export interface OwnedItemModel {
  id: string;
  definitionId: string;
  name: string;
  description: string;
  kind: ItemKind;
  effect: EffectModel;
  issuedAt: string;
  activationDeadline: string;
  activatedAt: string | null;
  state: "unused" | "active" | "ended" | "refundable" | "refunded";
  useBlock: ItemBlock | null;
  modelTimes: {
    modelId: string;
    name: string;
    contributionStartsAt: string;
    contributionEndsAt: string;
    aggregateEndsAt: string | null;
  }[];
  planTrial: { planCode: Exclude<GroupCode, "visitor">; endsAt: string } | null;
  extraCredit: { remaining: number; expiresAt: string } | null;
  refund: { eligibleAt: string; points: string } | null;
  refundedAt: string | null;
  refundReceiptId: string | null;
}
export interface ActivationPreviewModel {
  canActivate: boolean;
  reason: ItemBlock | null;
  effect: EffectModel;
  modelTimes: { modelId: string; addedSeconds: number; resultEndsAt: string }[];
  planResult: {
    planCode: Exclude<GroupCode, "visitor">;
    resultEndsAt: string;
  } | null;
  discardedTrial: {
    planCode: Exclude<GroupCode, "visitor">;
    endsAt: string;
    remainingSeconds: number;
  } | null;
  extraResult: { addedCount: number; expiresAt: string } | null;
  tokenExpiresAt: string | null;
}
export interface RefundPreviewModel {
  eligible: boolean;
  reason:
    | "models_not_all_retired"
    | "expired_before_retirement"
    | "already_refunded"
    | "wrong_item_kind"
    | null;
  points: string | null;
}
export interface MakeupPreviewModel {
  canUse: boolean;
  reason: ItemBlock | null;
  pointsAdded: string;
  affectedDays: {
    day: string;
    beforePoints: string;
    afterPoints: string;
    difference: string;
  }[];
  experienceAdded: "0";
}
export interface BenefitsPort {
  listShop(
    cursor?: string,
  ): Promise<PageModel<ShopItemModel> & { balance: string }>;
  listItems(cursor?: string): Promise<PageModel<OwnedItemModel>>;
  exchangeItem(
    id: string,
    quantity: number,
    key: string,
  ): Promise<SettlementModel>;
  previewActivation(id: string): Promise<ActivationPreviewModel>;
  activateItem(
    id: string,
    discard: boolean,
    key: string,
  ): Promise<{ receipt: SettlementModel; item: OwnedItemModel }>;
  previewRefund(id: string): Promise<RefundPreviewModel>;
  refundItem(
    id: string,
    key: string,
  ): Promise<{ receipt: SettlementModel; item: OwnedItemModel }>;
  previewMakeup(itemId: string, day: string): Promise<MakeupPreviewModel>;
  makeupDay(itemId: string, day: string, key: string): Promise<SettlementModel>;
  clearBenefitPreview(id: string): void;
}
