import { z } from "zod";
import {
  nonEmptyStringSchema as str,
  rfc3339Schema as time,
  dateSchema as day,
  successEnvelopeSchema,
} from "./common";
import { amountSchema, achievementKindSchema } from "./growth";
import { bilingualSchema } from "./admin-notices";
const positive = z.number().int().positive().max(2147483647),
  count = z.number().int().nonnegative();
const boundedText = (limit: number) =>
  bilingualSchema.refine(
    (b) =>
      [b.zh_CN, b.en_US].every(
        (v) => v === null || Array.from(v).length <= limit,
      ),
    "Text exceeds code point limit",
  );
const namedText = boundedText(200).refine(
  (b) => !!(b.zh_CN?.trim() || b.en_US?.trim()),
  "Name required",
);
export const rewardInputSchema = z
  .strictObject({
    points: amountSchema,
    item_definition_id: str.nullable(),
    item_count: count.max(2147483647),
  })
  .refine(
    (r) =>
      r.item_definition_id === null ? r.item_count === 0 : r.item_count > 0,
    "Invalid reward quantity",
  );
const checkinValues = {
  base_points: amountSchema,
  step_points: amountSchema,
  cap_points: amountSchema,
  normal_experience: amountSchema,
};
const checkinRuleSchema = z.strictObject({
  effective_day: day,
  ...checkinValues,
});
export const growthSettingsSchema = z.strictObject({
  learning_day: day,
  mastery_experience: amountSchema,
  growth_started_at: time.nullable(),
  current: checkinRuleSchema.nullable(),
  pending: checkinRuleSchema.nullable(),
  revision: str,
});
export const levelInputSchema = z.strictObject({
  level_number: positive,
  min_experience: amountSchema,
  reward_enabled: z.boolean(),
  reward: rewardInputSchema,
});
export const levelConfigSchema = levelInputSchema.extend({ id: str });
export const levelConfigurationSchema = z.strictObject({
  items: z.array(levelConfigSchema),
  revision: str,
});
export const levelChangesSchema = z.strictObject({
  expected_revision: str,
  changes: z
    .array(
      z.strictObject({
        client_key: z.uuid(),
        id: str.nullable(),
        value: levelInputSchema,
      }),
    )
    .min(1),
});
export const levelImpactSchema = z.strictObject({
  may_downgrade: z.boolean(),
  affected_users: count,
  rewards_use_latest_config: z.literal(true),
  confirmation_token: str,
  expires_at: time,
  revision: str,
});
export const achievementFieldsSchema = z.strictObject({
  threshold: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  enabled: z.boolean(),
  name: namedText,
  title: namedText,
  description: boundedText(2000),
  reward: z
    .strictObject({
      points: amountSchema,
      item_definition_id: str.nullable(),
      item_count: count.max(2147483647),
      experience: amountSchema,
    })
    .refine((r) =>
      r.item_definition_id === null ? r.item_count === 0 : r.item_count > 0,
    ),
});
export const achievementConfigSchema = achievementFieldsSchema.extend({
  id: str,
  kind: achievementKindSchema,
});
export const achievementConfigurationSchema = z.strictObject({
  kind: achievementKindSchema,
  items: z.array(achievementConfigSchema),
  revision: str,
});
export const achievementChangesSchema = z.strictObject({
  kind: achievementKindSchema,
  expected_revision: str,
  changes: z
    .array(
      z.strictObject({
        client_key: z.uuid(),
        id: str.nullable(),
        value: achievementFieldsSchema,
      }),
    )
    .min(1),
});
const savedRows = z.array(z.strictObject({ client_key: z.uuid(), id: str }));
export const growthSettingsEnvelopeSchema =
    successEnvelopeSchema(growthSettingsSchema),
  levelConfigurationEnvelopeSchema = successEnvelopeSchema(
    levelConfigurationSchema,
  ),
  achievementConfigurationEnvelopeSchema = successEnvelopeSchema(
    achievementConfigurationSchema,
  ),
  levelImpactEnvelopeSchema = successEnvelopeSchema(levelImpactSchema),
  levelSavedEnvelopeSchema = successEnvelopeSchema(
    z.strictObject({
      configuration: levelConfigurationSchema,
      saved_rows: savedRows,
    }),
  ),
  achievementSavedEnvelopeSchema = successEnvelopeSchema(
    z.strictObject({
      configuration: achievementConfigurationSchema,
      saved_rows: savedRows,
    }),
  );
export type GrowthSettingsDto = z.infer<typeof growthSettingsSchema>;
export type LevelDto = z.infer<typeof levelConfigSchema>;
export type AchievementConfigDto = z.infer<typeof achievementConfigSchema>;
