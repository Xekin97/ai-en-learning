import { z } from "zod";
import {
  nonEmptyStringSchema as str,
  rfc3339Schema as time,
  dateSchema,
  planCodeSchema,
  listEnvelopeSchema,
  successEnvelopeSchema,
  listMetaSchema,
} from "./common";
import { amountSchema, itemKindSchema, settlementSchema } from "./growth";
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const itemBlockSchema = z.enum([
  "expired",
  "already_used",
  "already_refunded",
  "model_unavailable",
  "plan_already_covers_models",
  "plan_not_above_base",
  "lower_than_current_trial",
  "invalid_target_day",
  "day_already_checked_in",
  "configuration_invalid",
]);
export const effectSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("makeup") }),
  z.strictObject({
    kind: z.literal("extra_credit"),
    extra_count: count.min(1),
  }),
  z.strictObject({
    kind: z.literal("model_trial"),
    models: z
      .array(
        z.strictObject({
          id: str,
          name: str,
          status: z.enum(["enabled", "disabled", "retired"]),
        }),
      )
      .min(1),
    trial_seconds: count.min(1),
    retirement_points: amountSchema,
  }),
  z.strictObject({
    kind: z.literal("plan_trial"),
    target_plan_code: planCodeSchema,
    trial_seconds: count.min(1),
  }),
]);
export const shopItemSchema = z
  .strictObject({
    id: str,
    name: str,
    description: z.string(),
    kind: itemKindSchema,
    price: amountSchema,
    activation_ttl_seconds: count.min(1),
    effect: effectSchema,
    available: z.boolean(),
    unavailable_reason: itemBlockSchema.nullable(),
  })
  .refine((v) => v.kind === v.effect.kind);
export const ownedItemSchema = z
  .strictObject({
    id: str,
    definition_id: str,
    name: str,
    description: z.string(),
    kind: itemKindSchema,
    effect: effectSchema,
    issued_at: time,
    activation_deadline: time,
    activated_at: time.nullable(),
    state: z.enum(["unused", "active", "ended", "refundable", "refunded"]),
    use_block: itemBlockSchema.nullable(),
    model_times: z.array(
      z.strictObject({
        model_id: str,
        name: str,
        contribution_starts_at: time,
        contribution_ends_at: time,
        aggregate_ends_at: time.nullable(),
      }),
    ),
    plan_trial: z
      .strictObject({ plan_code: planCodeSchema, ends_at: time })
      .nullable(),
    extra_credit: z
      .strictObject({ remaining: count, expires_at: time })
      .nullable(),
    refund: z
      .strictObject({ eligible_at: time, points: amountSchema })
      .nullable(),
    refunded_at: time.nullable(),
    refund_receipt_id: str.nullable(),
  })
  .refine((v) => v.kind === v.effect.kind);
export const shopEnvelopeSchema = z.strictObject({
  data: z.strictObject({
    balance: amountSchema,
    items: z.array(shopItemSchema),
  }),
  meta: listMetaSchema,
});
export const itemsEnvelopeSchema = listEnvelopeSchema(ownedItemSchema),
  exchangeEnvelopeSchema = successEnvelopeSchema(
    z.strictObject({ receipt: settlementSchema }),
  );
export const activationPreviewSchema = z
  .strictObject({
    can_activate: z.boolean(),
    reason: itemBlockSchema.nullable(),
    effect: effectSchema,
    model_times: z.array(
      z.strictObject({
        model_id: str,
        added_seconds: count,
        result_ends_at: time,
      }),
    ),
    plan_result: z
      .strictObject({ plan_code: planCodeSchema, result_ends_at: time })
      .nullable(),
    discarded_trial: z
      .strictObject({
        plan_code: planCodeSchema,
        ends_at: time,
        remaining_seconds: count,
      })
      .nullable(),
    extra_result: z
      .strictObject({ added_count: count, expires_at: time })
      .nullable(),
    confirmation_token: str.nullable(),
    token_expires_at: time.nullable(),
  })
  .refine((v) => v.can_activate === (v.confirmation_token !== null));
export const activationPreviewEnvelopeSchema = successEnvelopeSchema(
  activationPreviewSchema,
);
export const itemCommandEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({ receipt: settlementSchema, item: ownedItemSchema }),
);
export const refundPreviewSchema = z
  .strictObject({
    eligible: z.boolean(),
    reason: z
      .enum([
        "models_not_all_retired",
        "expired_before_retirement",
        "already_refunded",
        "wrong_item_kind",
      ])
      .nullable(),
    points: amountSchema.nullable(),
    confirmation_token: str.nullable(),
  })
  .refine((v) => v.eligible === (v.confirmation_token !== null));
export const refundPreviewEnvelopeSchema =
  successEnvelopeSchema(refundPreviewSchema);
export const makeupPreviewSchema = z.strictObject({
  can_use: z.boolean(),
  reason: itemBlockSchema.nullable(),
  points_added: amountSchema,
  affected_days: z.array(
    z.strictObject({
      day: dateSchema,
      before_points: amountSchema,
      after_points: amountSchema,
      difference: amountSchema,
    }),
  ),
  experience_added: z.literal("0"),
  confirmation_token: str.nullable(),
});
export const makeupPreviewEnvelopeSchema =
  successEnvelopeSchema(makeupPreviewSchema);
export const makeupEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({
    receipt: settlementSchema,
    affected_days: z.array(
      z.strictObject({ day: dateSchema, points_added: amountSchema }),
    ),
    checkin: z.strictObject({ current_streak: count, highest_streak: count }),
  }),
);
export type EffectDto = z.infer<typeof effectSchema>;
export type OwnedItemDto = z.infer<typeof ownedItemSchema>;
export type ShopItemDto = z.infer<typeof shopItemSchema>;
export type ActivationPreviewDto = z.infer<typeof activationPreviewSchema>;
