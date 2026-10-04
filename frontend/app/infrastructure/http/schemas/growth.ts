import { z } from "zod";
import {
  nonEmptyStringSchema as str,
  rfc3339Schema as time,
  dateSchema,
  successEnvelopeSchema,
  listEnvelopeSchema,
} from "./common";
export const amountSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)$/)
  .refine((v) => BigInt(v) <= 9223372036854775807n);
export const signedAmountSchema = z
  .string()
  .regex(/^(0|-?[1-9]\d*)$/)
  .refine(
    (v) =>
      BigInt(v) >= -9223372036854775808n && BigInt(v) <= 9223372036854775807n,
  );
export const itemKindSchema = z.enum([
  "makeup",
  "extra_credit",
  "model_trial",
  "plan_trial",
]);
export const achievementKindSchema = z.enum([
  "checkin_streak",
  "review_streak",
  "mastered_words",
  "saved_passages",
]);
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
export const rewardSchema = z.strictObject({
  points: amountSchema,
  experience: amountSchema,
  item: z
    .strictObject({
      definition_id: str,
      name: str,
      kind: itemKindSchema,
      count: count.min(1),
    })
    .nullable(),
});
export const settlementSchema = z.strictObject({
  id: str,
  kind: str,
  settled_at: time,
  points_delta: signedAmountSchema,
  experience_delta: amountSchema,
  points_after: amountSchema,
  experience_after: amountSchema,
  items: z.array(
    z.strictObject({
      item_id: str,
      definition_id: str,
      kind: itemKindSchema,
      activation_deadline: time,
    }),
  ),
});
export const growthSchema = z.strictObject({
  learning_day: dateSchema,
  growth_started_at: time,
  points: amountSchema,
  experience: amountSchema,
  level: z.strictObject({
    id: str,
    number: count.min(1),
    name: str,
    min_experience: amountSchema,
  }),
  next_level: z
    .strictObject({
      id: str,
      number: count.min(1),
      min_experience: amountSchema,
      reward: rewardSchema,
    })
    .nullable(),
  mastered_total: count,
  saved_total: count,
  successful_review_total: count,
  checkin: z.strictObject({
    signed_today: z.boolean(),
    current_streak: count,
    highest_streak: count,
    today_points: amountSchema,
    today_experience: amountSchema,
  }),
  review_streak: z.strictObject({ current: count, highest: count }),
  pending_reward_count: count,
});
export const growthEnvelopeSchema = successEnvelopeSchema(growthSchema);
export const checkinsEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({
    learning_day: dateSchema,
    makeup_earliest_day: dateSchema,
    days: z.array(
      z.strictObject({
        day: dateSchema,
        state: z.enum([
          "normal",
          "makeup",
          "missing",
          "future",
          "before_start",
        ]),
        points_paid: amountSchema,
        can_makeup: z.boolean(),
      }),
    ),
  }),
);
const award = {
  id: str,
  state: z.enum(["unachieved", "claimable", "blocked", "claimed"]),
  block_reason: z
    .enum(["tier_disabled", "reward_unavailable", "level_required"])
    .nullable(),
  achieved_at: time.nullable(),
  claimed_at: time.nullable(),
  reward: rewardSchema,
  settlement_id: str.nullable(),
};
export const levelAwardSchema = z.strictObject({
  ...award,
  level_id: str,
  level_number: count.min(1),
  min_experience: amountSchema,
});
export const achievementSchema = z.strictObject({
  ...award,
  tier_id: str,
  kind: achievementKindSchema,
  name: str,
  title: str,
  description: z.string().nullable(),
  threshold: count.min(1),
  progress: count,
});
export const levelsEnvelopeSchema = listEnvelopeSchema(levelAwardSchema),
  achievementsEnvelopeSchema = listEnvelopeSchema(achievementSchema);
export const claimRewardEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({
    receipt: settlementSchema,
    growth: z.strictObject({
      points: amountSchema,
      experience: amountSchema,
      level_number: count.min(1),
      pending_reward_count: count,
    }),
  }),
);
export type RewardDto = z.infer<typeof rewardSchema>;
export type SettlementDto = z.infer<typeof settlementSchema>;
export type GrowthDto = z.infer<typeof growthSchema>;
export type AchievementDto = z.infer<typeof achievementSchema>;
export type LevelAwardDto = z.infer<typeof levelAwardSchema>;
