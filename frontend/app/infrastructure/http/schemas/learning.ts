import { z } from "zod";
import {
  listEnvelopeSchema,
  meaningLanguageSchema,
  nonEmptyStringSchema,
  entryMeaningSchema,
  passageLengthSchema,
  rfc3339Schema,
  scenarioSchema,
  successEnvelopeSchema,
} from "./common";
import { occurrenceSchema, spanSchema } from "./generation";

export const learningSummaryEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({
    generation_count: z.number().int().min(0),
    unique_learned_entries: z.number().int().min(0),
    participating_batches: z.number().int().min(0),
    paused_batches: z.number().int().min(0),
    successful_review_count: z.number().int().min(0),
    batches_ever_reviewed_successfully: z.number().int().min(0),
  }),
);

const singleReviewSchema = z.union([
  z.strictObject({ action: z.literal("start"), session_id: z.null() }),
  z.strictObject({
    action: z.literal("resume"),
    session_id: nonEmptyStringSchema,
  }),
]);

export const batchSummarySchema = z.strictObject({
  id: nonEmptyStringSchema,
  saved_at: rfc3339Schema,
  passage_preview: nonEmptyStringSchema,
  tags: z.array(nonEmptyStringSchema).min(1).max(3),
  entries: z.array(nonEmptyStringSchema).min(1),
  model: z.strictObject({ name: nonEmptyStringSchema }),
  meaning_language: meaningLanguageSchema,
  scenario: scenarioSchema,
  length: passageLengthSchema,
  participates_in_range_review: z.boolean(),
  single_batch_review: singleReviewSchema.optional(),
});
export const batchListEnvelopeSchema = listEnvelopeSchema(batchSummarySchema);

export const batchDetailSchema = z
  .strictObject({
    id: nonEmptyStringSchema,
    saved_at: rfc3339Schema,
    configuration: z.strictObject({
      model: z.strictObject({ name: nonEmptyStringSchema }),
      meaning_language: meaningLanguageSchema,
      scenario: scenarioSchema,
      length: passageLengthSchema,
    }),
    participates_in_range_review: z.boolean(),
    passage: nonEmptyStringSchema,
    tags: z.array(nonEmptyStringSchema).min(1).max(3),
    targets: z
      .array(
        z.strictObject({
          entry: nonEmptyStringSchema,
          entry_meaning: entryMeaningSchema,
          hint_phrase: nonEmptyStringSchema,
          hint_blanks: z.array(spanSchema).min(1),
          occurrences: z.array(occurrenceSchema).min(1),
        }),
      )
      .min(1),
    review_summary: z.strictObject({
      completed_count: z.number().int().min(0),
      successful_count: z.number().int().min(0),
      last_completed_at: rfc3339Schema.nullable(),
    }),
  })
  .superRefine((value, context) => {
    if (
      value.review_summary.successful_count >
      value.review_summary.completed_count
    ) {
      context.addIssue({
        code: "custom",
        path: ["review_summary", "successful_count"],
        message: "successful count exceeds completed count",
      });
    }
  });

export const batchDetailEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({ batch: batchDetailSchema }),
);
export const participationEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({
    batch_id: nonEmptyStringSchema,
    participates_in_range_review: z.boolean(),
  }),
);

export type LearningSummaryDto = z.infer<
  typeof learningSummaryEnvelopeSchema
>["data"];
export type BatchSummaryDto = z.infer<typeof batchSummarySchema>;
export type BatchDetailDto = z.infer<typeof batchDetailSchema>;
