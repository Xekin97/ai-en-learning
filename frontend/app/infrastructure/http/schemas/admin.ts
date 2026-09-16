import { z } from "zod";
import {
  groupCodeSchema,
  listEnvelopeSchema,
  nonEmptyStringSchema,
  nullableStringSchema,
  passageLengthSchema,
  planCodeSchema,
  rfc3339Schema,
  successEnvelopeSchema,
  uiLocaleSchema,
} from "./common";
import { batchDetailSchema, batchSummarySchema } from "./learning";

const credentialDataSchema = z.union([
  z.strictObject({
    configured: z.literal(false),
    masked_hint: z.null(),
    updated_at: z.null(),
  }),
  z.strictObject({
    configured: z.literal(true),
    masked_hint: nonEmptyStringSchema,
    updated_at: rfc3339Schema,
  }),
]);
export const credentialEnvelopeSchema =
  successEnvelopeSchema(credentialDataSchema);

export const adminModelSchema = z.strictObject({
  id: nonEmptyStringSchema,
  display_name: nonEmptyStringSchema,
  description: nullableStringSchema,
  openrouter_model_id: nonEmptyStringSchema,
  enabled: z.boolean(),
  assigned_group_codes: z.array(groupCodeSchema),
  created_at: rfc3339Schema,
  updated_at: rfc3339Schema,
});
export const adminModelListEnvelopeSchema =
  listEnvelopeSchema(adminModelSchema);
export const adminModelEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({ model: adminModelSchema }),
);

export const adminGroupSchema = z.strictObject({
  code: groupCodeSchema,
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
  z.strictObject({ items: z.array(adminGroupSchema).length(4) }),
);
export const adminGroupEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({ group: adminGroupSchema }),
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
    generation_quota: adminGenerationQuotaSchema,
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
    generation_quota: z.null(),
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

export type CredentialDto = z.infer<typeof credentialDataSchema>;
export type AdminModelDto = z.infer<typeof adminModelSchema>;
export type AdminGroupDto = z.infer<typeof adminGroupSchema>;
export type AdminUserSummaryDto = z.infer<typeof adminUserSummarySchema>;
export type AdminUserDetailDto = z.infer<typeof adminUserDetailSchema>;
