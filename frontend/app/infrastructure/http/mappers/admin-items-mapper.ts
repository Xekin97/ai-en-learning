import type { ItemDefinitionDto } from "../schemas/admin-items";
import type {
  ItemDefinitionModel,
  ItemDefinitionInput,
  ItemDefinitionEffect,
} from "@application/admin/items";
import { bilingual, bilingualBody } from "./admin-notice-mapper";
function effect(d: ItemDefinitionDto["effect"]): ItemDefinitionEffect {
  switch (d.kind) {
    case "makeup":
      return { kind: "makeup" };
    case "extra_credit":
      return { kind: d.kind, extraCount: d.extra_count };
    case "model_trial":
      return {
        kind: d.kind,
        modelIds: [...d.model_ids],
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
export function mapItemDefinition(
  d: ItemDefinitionDto,
  revision: string,
): ItemDefinitionModel {
  return {
    id: d.id,
    kind: d.kind,
    name: bilingual(d.name),
    description: bilingual(d.description),
    exchangePrice: d.exchange_price,
    activationTtlSeconds: d.activation_ttl_seconds,
    effect: effect(d.effect),
    listed: d.listed,
    everIssued: d.ever_issued,
    referenceCount: d.reference_count,
    createdAt: d.created_at,
    updatedAt: d.updated_at,
    revision,
  };
}
export function itemDefinitionBody(input: ItemDefinitionInput) {
  const value = input.effect;
  const effect =
    value.kind === "makeup"
      ? { kind: value.kind }
      : value.kind === "extra_credit"
        ? { kind: value.kind, extra_count: value.extraCount }
        : value.kind === "model_trial"
          ? {
              kind: value.kind,
              model_ids: [...value.modelIds],
              trial_seconds: value.trialSeconds,
              retirement_points: value.retirementPoints,
            }
          : {
              kind: value.kind,
              target_plan_code: value.targetPlanCode,
              trial_seconds: value.trialSeconds,
            };
  return {
    kind: input.kind,
    name: bilingualBody(input.name),
    description: bilingualBody(input.description),
    exchange_price: input.exchangePrice,
    activation_ttl_seconds: input.activationTtlSeconds,
    effect,
  };
}
