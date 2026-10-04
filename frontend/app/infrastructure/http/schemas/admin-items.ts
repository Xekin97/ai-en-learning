import { z } from "zod";
import {
  nonEmptyStringSchema as str,
  rfc3339Schema as time,
  successEnvelopeSchema,
  listMetaSchema,
  planCodeSchema,
} from "./common";
import { bilingualSchema } from "./admin-notices";
import { itemKindSchema, amountSchema } from "./growth";
const positive = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const itemDefinitionEffectSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("makeup") }),
  z.strictObject({ kind: z.literal("extra_credit"), extra_count: positive }),
  z.strictObject({
    kind: z.literal("model_trial"),
    model_ids: z
      .array(str)
      .min(1)
      .refine((ids) => new Set(ids).size === ids.length),
    trial_seconds: positive,
    retirement_points: amountSchema,
  }),
  z.strictObject({
    kind: z.literal("plan_trial"),
    target_plan_code: planCodeSchema,
    trial_seconds: positive,
  }),
]);
export const itemDefinitionInputSchema = z
  .strictObject({
    kind: itemKindSchema,
    name: bilingualSchema,
    description: bilingualSchema,
    exchange_price: amountSchema,
    activation_ttl_seconds: positive,
    effect: itemDefinitionEffectSchema,
  })
  .refine((input) => input.kind === input.effect.kind, "Item kind mismatch");
export const itemDefinitionSchema = itemDefinitionInputSchema.safeExtend({
  id: str,
  listed: z.boolean(),
  ever_issued: z.boolean(),
  reference_count: z.number().int().nonnegative(),
  created_at: time,
  updated_at: time,
});
export const itemDefinitionListEnvelopeSchema = z.strictObject({
  data: z.strictObject({ items: z.array(itemDefinitionSchema), revision: str }),
  meta: listMetaSchema,
});
export const itemDefinitionEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({ item: itemDefinitionSchema, revision: str }),
);
export const itemReferencesEnvelopeSchema = z.strictObject({
  data: z.strictObject({
    ever_issued: z.boolean(),
    items: z.array(
      z.strictObject({
        kind: z.enum(["level", "achievement"]),
        id: str,
        name: z.string(),
        enabled: z.boolean(),
      }),
    ),
  }),
  meta: listMetaSchema,
});
export type ItemDefinitionDto = z.infer<typeof itemDefinitionSchema>;
