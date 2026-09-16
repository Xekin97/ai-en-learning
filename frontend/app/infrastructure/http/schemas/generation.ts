import { z } from "zod";
import {
  meaningLanguageSchema,
  nonEmptyStringSchema,
  entryMeaningSchema,
  nullableStringSchema,
  passageLengthSchema,
  rfc3339Schema,
  scenarioSchema,
  successEnvelopeSchema,
} from "./common";

export const spanSchema = z.strictObject({
  start: z.number().int().min(0),
  end: z.number().int().positive(),
});
export const occurrenceSchema = spanSchema
  .extend({ surface: nonEmptyStringSchema })
  .strict();

export const vocabularyEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({
    items: z.array(z.strictObject({ entry: nonEmptyStringSchema })),
    vocabulary_version: nonEmptyStringSchema,
  }),
);

const limitedQuotaSchema = z
  .strictObject({
    kind: z.literal("limited"),
    limit: z.number().int().min(0),
    remaining: z.number().int().min(0),
    window_hours: z.literal(24),
    refreshes_at: rfc3339Schema.nullable(),
  })
  .superRefine((value, context) => {
    if (value.remaining > value.limit)
      context.addIssue({
        code: "custom",
        path: ["remaining"],
        message: "remaining exceeds limit",
      });
  });

const unlimitedQuotaSchema = z.strictObject({
  kind: z.literal("unlimited"),
  limit: z.null(),
  remaining: z.null(),
  window_hours: z.literal(24),
  refreshes_at: z.null(),
});

const availabilityReasonSchema = z.enum([
  "credential_missing",
  "no_models",
  "no_lengths",
  "quota_disabled",
  "quota_exhausted",
  "generation_in_progress",
]);

const generationOptionsDataSchema = z.strictObject({
  models: z.array(
    z.strictObject({
      id: nonEmptyStringSchema,
      name: nonEmptyStringSchema,
      description: nullableStringSchema,
    }),
  ),
  meaning_languages: z.array(meaningLanguageSchema).min(1),
  scenarios: z.array(scenarioSchema).min(1),
  lengths: z.array(passageLengthSchema),
  max_entries: z.number().int().positive(),
  availability: z.union([
    z.strictObject({ can_generate: z.literal(true), reason: z.null() }),
    z.strictObject({
      can_generate: z.literal(false),
      reason: availabilityReasonSchema,
    }),
  ]),
  quota: z.discriminatedUnion("kind", [
    limitedQuotaSchema,
    unlimitedQuotaSchema,
  ]),
});
export const generationOptionsEnvelopeSchema = successEnvelopeSchema(
  generationOptionsDataSchema,
);

export const generationStartedEventSchema = z.strictObject({
  run_id: nonEmptyStringSchema,
  generation_token: nonEmptyStringSchema,
});
export const passageDeltaEventSchema = z.strictObject({ text: z.string() });

export const generationTargetSchema = z.strictObject({
  entry: nonEmptyStringSchema,
  entry_meaning: entryMeaningSchema,
  hint_phrase: nonEmptyStringSchema,
  hint_blanks: z.array(spanSchema).min(1),
  occurrences: z.array(occurrenceSchema).min(1),
});

export const generationValidatedEventSchema = z.strictObject({
  run_id: nonEmptyStringSchema,
  result: z.strictObject({
    passage: nonEmptyStringSchema,
    tags: z.array(nonEmptyStringSchema).min(1).max(3),
    targets: z.array(generationTargetSchema).min(1),
  }),
});

export const generationFailedEventSchema = z.strictObject({
  code: nonEmptyStringSchema,
  quota_refunded: z.boolean(),
  retryable: z.boolean(),
  request_id: nonEmptyStringSchema,
});
export const generationCancelledEventSchema = z.strictObject({
  quota_refunded: z.literal(false),
});

export const generationCancelEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({
    status: z.enum(["cancelled", "valid", "failed"]),
    quota_refunded: z.boolean(),
  }),
);

export const batchCreatedEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({
    batch_id: nonEmptyStringSchema,
    saved_at: rfc3339Schema,
  }),
);
export const claimEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({
    claim_token: nonEmptyStringSchema,
    expires_at: rfc3339Schema,
  }),
);
export const claimConsumedEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({
    batch_id: nonEmptyStringSchema,
    claimed: z.literal(true),
  }),
);

export type VocabularyDto = z.infer<typeof vocabularyEnvelopeSchema>["data"];
export type GenerationOptionsDto = z.infer<typeof generationOptionsDataSchema>;
export type GenerationValidatedEventDto = z.infer<
  typeof generationValidatedEventSchema
>;
export type SpanDto = z.infer<typeof spanSchema>;
export type OccurrenceDto = z.infer<typeof occurrenceSchema>;
