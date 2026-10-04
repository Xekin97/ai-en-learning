import { z } from "zod";
import {
  dateSchema as day,
  rfc3339Schema as time,
  successEnvelopeSchema,
} from "./common";
const count = z.number().int().nonnegative();
export const usageSchema = z.strictObject({
  logical_runs: count,
  provider_calls: count,
  input_tokens: count.nullable(),
  output_tokens: count.nullable(),
  cost: z
    .strictObject({
      amount: z.string().regex(/^\d+(?:\.\d+)?$/),
      unit: z.literal("openrouter_credits"),
    })
    .nullable(),
  unknown_calls: count,
});
export const metricSchema = z
  .strictObject({
    value: z.number().nonnegative().nullable(),
    numerator: count.nullable(),
    denominator: count.nullable(),
    status: z.enum(["ready", "no_sample", "observing", "unavailable"]),
    reason: z.enum(["detail_expired", "source_unavailable"]).nullable(),
  })
  .refine(
    (m) => (m.status === "ready" ? m.value !== null : m.value === null),
    "Invalid metric availability",
  );
const m = metricSchema,
  base = {
    range: z.strictObject({ start_day: day, end_day: day }),
    learning_day: day,
    updated_at: time.nullable(),
    freshness: z.enum(["current", "delayed", "no_data"]),
    detail_available_from: time,
  };
export const trafficSchema = z.strictObject({
  ...base,
  pv: m,
  uv: m,
  bounce_rate: m,
  series: z.array(z.strictObject({ day, pv: m, uv: m, bounce_rate: m })),
  channels: z.array(
    z.strictObject({
      source_type: z.enum(["utm", "referrer", "direct_unknown"]),
      pv: m,
      uv: m,
    }),
  ),
  clarity: z.strictObject({
    available: z.boolean(),
    url: z.string().url().nullable(),
  }),
});
export const funnelSchema = z.strictObject({
  ...base,
  registration: z.strictObject({
    converted_visitor_uv: m,
    anonymous_uv: m,
    rate: m,
    new_accounts: m,
    unattributed_accounts: m,
  }),
  activation: z.strictObject({
    within_7_days: m,
    same_day: m,
    cohorts: z.array(z.strictObject({ registration_day: day, rate: m })),
  }),
  review: z.strictObject({
    started: m,
    submitted: m,
    successful: m,
    completion_rate: m,
    success_rate: m,
  }),
  generation: z.strictObject({
    valid: m,
    failed: m,
    cancelled: m,
    ongoing: m,
    precheck_rejected: m,
    failure_rate: m,
  }),
});
export const retentionSchema = z.strictObject({
  ...base,
  cohorts: z.array(
    z.strictObject({
      registration_day: day,
      accounts: count,
      d1: m,
      d7: m,
      d30: m,
    }),
  ),
  series: z.array(
    z.strictObject({
      day,
      wau: m,
      valid_generations: m,
      saved_passages: m,
      review_submissions: m,
      successful_reviews: m,
      reviews_per_active_learner: m,
    }),
  ),
});
export const overviewSchema = z.strictObject({
  ...base,
  today: z.strictObject({
    pv: m,
    uv: m,
    valid_generations: m,
    saved_passages: m,
    review_submissions: m,
  }),
  last_7_days: z.strictObject({
    wau: m,
    registration_rate: m,
    activation_rate: m,
    generation_failure_rate: m,
  }),
  preview_usage: usageSchema,
});
export const trafficEnvelopeSchema = successEnvelopeSchema(trafficSchema),
  funnelEnvelopeSchema = successEnvelopeSchema(funnelSchema),
  retentionEnvelopeSchema = successEnvelopeSchema(retentionSchema),
  overviewEnvelopeSchema = successEnvelopeSchema(overviewSchema);
export type MetricDto = z.infer<typeof m>;
export type TrafficDto = z.infer<typeof trafficSchema>;
export type FunnelDto = z.infer<typeof funnelSchema>;
export type RetentionDto = z.infer<typeof retentionSchema>;
export type OverviewDto = z.infer<typeof overviewSchema>;
export type UsageDto = z.infer<typeof usageSchema>;
