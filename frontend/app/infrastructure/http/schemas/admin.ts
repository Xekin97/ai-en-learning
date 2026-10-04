import { z } from "zod";
import {
  groupCodeSchema,
  listEnvelopeSchema,
  listMetaSchema,
  nonEmptyStringSchema,
  nullableStringSchema,
  passageLengthSchema,
  planCodeSchema,
  rfc3339Schema,
  successEnvelopeSchema,
  uiLocaleSchema,
} from "./common";
import { amountSchema } from "./growth";
import { batchDetailSchema, batchSummarySchema } from "./learning";

export const modelConnectionSchema = z.strictObject({
  id: nonEmptyStringSchema,
  name: nonEmptyStringSchema,
  protocol: z.enum(["openai_chat", "openai_responses", "anthropic_messages"]),
  base_url: nonEmptyStringSchema,
  credential_configured: z.boolean(),
  masked_hint: nullableStringSchema,
});
export const modelConnectionsEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({ items: z.array(modelConnectionSchema) }),
);
export const modelConnectionTestEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({ ok: z.literal(true) }),
);
export type ModelConnectionDto = z.infer<typeof modelConnectionSchema>;

export const adminModelSchema = z.strictObject({
  id: nonEmptyStringSchema,
  display_name: nonEmptyStringSchema,
  description: nullableStringSchema,
  provider_model_id: nonEmptyStringSchema,
  connection: modelConnectionSchema,
  max_output_tokens: z.number().int().positive().nullable(),
  output_mode: z.enum(["prompt", "json_schema"]),
  enabled: z.boolean(),
  retired_at: rfc3339Schema.nullable(),
  assigned_group_codes: z.array(groupCodeSchema),
  created_at: rfc3339Schema,
  updated_at: rfc3339Schema,
});
export const adminModelListEnvelopeSchema = z.strictObject({
  data: z.strictObject({
    items: z.array(adminModelSchema),
    revision: nonEmptyStringSchema,
  }),
  meta: listMetaSchema,
});
export const adminModelEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({ model: adminModelSchema, revision: nonEmptyStringSchema }),
);

export const adminModelBatchEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({
    items: z.array(adminModelSchema).min(1).max(100),
    revision: nonEmptyStringSchema,
  }),
);

export const adminProviderSchema = z.strictObject({
  connection: modelConnectionSchema,
  models: z.array(adminModelSchema),
});
export const adminProviderListEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({
    items: z.array(adminProviderSchema),
    revision: nonEmptyStringSchema,
  }),
);
export const adminProviderEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({
    provider: adminProviderSchema,
    revision: nonEmptyStringSchema,
  }),
);
export type AdminProviderDto = z.infer<typeof adminProviderSchema>;

export const adminGroupSchema = z.strictObject({
  code: groupCodeSchema,
  priority: z.number().int().nonnegative(),
  rolling_24h_limit: z.number().int().min(0).nullable(),
  max_entries: z.number().int().positive(),
  allowed_lengths: z.array(passageLengthSchema),
  models: z.array(
    z.strictObject({
      id: nonEmptyStringSchema,
      display_name: nonEmptyStringSchema,
      enabled: z.boolean(),
    }),
  ),
});
export const adminGroupsEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({
    items: z.array(adminGroupSchema).length(4),
    revision: nonEmptyStringSchema,
  }),
);
export const adminGroupEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({ group: adminGroupSchema, revision: nonEmptyStringSchema }),
);

export const adminUserSummarySchema = z.union([
  z.strictObject({
    id: nonEmptyStringSchema,
    username: nonEmptyStringSchema,
    role: z.literal("learner"),
    plan_code: planCodeSchema,
    status: z.literal("active"),
    created_at: rfc3339Schema,
  }),
  z.strictObject({
    id: nonEmptyStringSchema,
    username: nonEmptyStringSchema,
    role: z.literal("admin"),
    plan_code: z.null(),
    status: z.literal("active"),
    created_at: rfc3339Schema,
  }),
]);
export const adminUsersEnvelopeSchema = listEnvelopeSchema(
  adminUserSummarySchema,
);

export const adminGenerationQuotaSchema = z.union([
  z.strictObject({
    kind: z.literal("limited"),
    remaining: z.number().int().min(0),
  }),
  z.strictObject({ kind: z.literal("unlimited"), remaining: z.null() }),
]);

export const adminUserDetailSchema = z.union([
  z.strictObject({
    id: nonEmptyStringSchema,
    username: nonEmptyStringSchema,
    role: z.literal("learner"),
    plan_code: planCodeSchema,
    status: z.literal("active"),
    ui_locale: uiLocaleSchema.nullable(),
    nickname: z.string().nullable(),
    gender: z.enum(["male", "female"]).nullable(),
    last_login_at: rfc3339Schema.nullable(),
    last_learning_at: rfc3339Schema.nullable(),
    generation_quota: adminGenerationQuotaSchema,
    base_revision: nonEmptyStringSchema,
    effective_plan_code: planCodeSchema,
    growth: z.strictObject({
      level_number: z.number().int().positive(),
      points: amountSchema,
      experience: amountSchema,
      mastered_total: z.number().int().nonnegative(),
      saved_total: z.number().int().nonnegative(),
    }),
    created_at: rfc3339Schema,
    learning_batch_count: z.number().int().min(0),
  }),
  z.strictObject({
    id: nonEmptyStringSchema,
    username: nonEmptyStringSchema,
    role: z.literal("admin"),
    plan_code: z.null(),
    status: z.literal("active"),
    ui_locale: uiLocaleSchema.nullable(),
    nickname: z.string().nullable(),
    gender: z.enum(["male", "female"]).nullable(),
    last_login_at: rfc3339Schema.nullable(),
    last_learning_at: rfc3339Schema.nullable(),
    generation_quota: z.null(),
    base_revision: z.null(),
    effective_plan_code: z.null(),
    growth: z.null(),
    created_at: rfc3339Schema,
    learning_batch_count: z.number().int().min(0),
  }),
]);
export const adminUserEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({ user: adminUserDetailSchema }),
);
export const userGroupChangeEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({ user: adminUserDetailSchema, quota_reset: z.literal(true) }),
);

export const adminBatchListEnvelopeSchema = listEnvelopeSchema(
  batchSummarySchema.omit({ single_batch_review: true }),
);
export const adminBatchDetailEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({ batch: batchDetailSchema }),
);

export type AdminModelDto = z.infer<typeof adminModelSchema>;
export type AdminGroupDto = z.infer<typeof adminGroupSchema>;
export type AdminUserSummaryDto = z.infer<typeof adminUserSummarySchema>;
export type AdminUserDetailDto = z.infer<typeof adminUserDetailSchema>;

export const removalImpactEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({
    model: adminModelSchema,
    affected_groups: z.array(
      z.strictObject({
        code: groupCodeSchema,
        remaining_enabled_models: z.number().int().nonnegative(),
      }),
    ),
    affected_presets: z.number().int().nonnegative(),
    affected_item_definitions: z.number().int().nonnegative(),
    affected_owned_cards: z.number().int().nonnegative(),
    confirmation_token: nonEmptyStringSchema,
    revision: nonEmptyStringSchema,
  }),
);
export const modelRemovedEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({
    model: adminModelSchema,
    affected_groups: z.array(groupCodeSchema),
    revision: nonEmptyStringSchema,
  }),
);
export const groupImpactEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({
    base_users: z.number().int().nonnegative(),
    active_trial_users: z.number().int().nonnegative(),
    priority_changed: z.boolean(),
    may_change_effective_plan: z.boolean(),
    loses_all_models: z.boolean(),
    revision: nonEmptyStringSchema,
  }),
);
export const priorityImpactEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({
    affected_base_users: z.number().int().nonnegative(),
    affected_trial_users: z.number().int().nonnegative(),
    revision: nonEmptyStringSchema,
  }),
);
