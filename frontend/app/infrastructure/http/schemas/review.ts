import { z } from "zod";
import {
  dateSchema,
  nonEmptyStringSchema,
  entryMeaningSchema,
  rfc3339Schema,
  scenarioSchema,
  successEnvelopeSchema,
} from "./common";

const progressSchema = z
  .strictObject({
    completed_batches: z.number().int().min(0),
    total_batches: z.number().int().positive(),
    successful_batches: z.number().int().min(0),
    unsuccessful_batches: z.number().int().min(0),
  })
  .superRefine((value, context) => {
    if (
      value.completed_batches !==
        value.successful_batches + value.unsuccessful_batches ||
      value.completed_batches > value.total_batches
    ) {
      context.addIssue({
        code: "custom",
        message: "review progress is inconsistent",
      });
    }
  });

const dateRangeSchema = z.strictObject({
  start_date: dateSchema,
  end_date: dateSchema,
  timezone: nonEmptyStringSchema,
});

const batchProjectionSchema = z.strictObject({
  batch_id: nonEmptyStringSchema,
  saved_at: rfc3339Schema,
  scenario: scenarioSchema,
});

const summarySchema = z
  .strictObject({
    total_batches: z.number().int().positive(),
    successful_batches: z.number().int().min(0),
    unsuccessful_batches: z.number().int().min(0),
    skipped_batches: z.number().int().min(0),
  })
  .superRefine((value, context) => {
    if (
      value.successful_batches + value.unsuccessful_batches !==
        value.total_batches ||
      value.skipped_batches > value.unsuccessful_batches
    ) {
      context.addIssue({
        code: "custom",
        message: "review summary is inconsistent",
      });
    }
  });

export const reviewRangePreviewEnvelopeSchema = successEnvelopeSchema(
  z
    .strictObject({
      batch_count: z.number().int().min(0),
      entry_count: z.number().int().min(0),
      empty: z.boolean(),
    })
    .superRefine((value, context) => {
      if (value.empty !== (value.batch_count === 0 && value.entry_count === 0))
        context.addIssue({ code: "custom", message: "empty is inconsistent" });
    }),
);

const activeRangeSchema = z.strictObject({
  session_id: nonEmptyStringSchema,
  mode: z.literal("range"),
  status: z.literal("active"),
  date_range: dateRangeSchema,
  progress: progressSchema,
});
export const activeRangeEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({ session: activeRangeSchema.nullable() }),
);

const activeSessionSchema = z.strictObject({
  session_id: nonEmptyStringSchema,
  mode: z.enum(["range", "single_batch"]),
  status: z.literal("active"),
  date_range: dateRangeSchema.nullable(),
  progress: progressSchema,
  current_batch: batchProjectionSchema,
  summary: z.null(),
});

const completedSessionSchema = z.strictObject({
  session_id: nonEmptyStringSchema,
  mode: z.enum(["range", "single_batch"]),
  status: z.literal("completed"),
  date_range: dateRangeSchema.nullable(),
  progress: progressSchema,
  current_batch: z.null(),
  summary: summarySchema,
});

function validateModeDateRange(
  value: { mode: "range" | "single_batch"; date_range: unknown },
  context: z.RefinementCtx,
) {
  if ((value.mode === "range") !== (value.date_range !== null))
    context.addIssue({
      code: "custom",
      path: ["date_range"],
      message: "mode and date_range disagree",
    });
}

export const reviewSessionSchema = z
  .discriminatedUnion("status", [activeSessionSchema, completedSessionSchema])
  .superRefine(validateModeDateRange);
export const reviewSessionEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({ session: reviewSessionSchema }),
);

export const reviewSessionCreatedEnvelopeSchema = successEnvelopeSchema(
  z
    .strictObject({
      session_id: nonEmptyStringSchema,
      mode: z.enum(["range", "single_batch"]),
      status: z.literal("active"),
      reused: z.boolean(),
      date_range: dateRangeSchema.nullable(),
      progress: progressSchema,
      current_batch: batchProjectionSchema,
    })
    .superRefine(validateModeDateRange),
);

const hintTextSegmentSchema = z.strictObject({
  kind: z.literal("text"),
  text: nonEmptyStringSchema,
});
const hintBlankSegmentSchema = z.strictObject({
  kind: z.literal("blank"),
  length_hint: z.literal(8),
});
const passageTextSegmentSchema = z.strictObject({
  kind: z.literal("text"),
  text: nonEmptyStringSchema,
});
const passageBlankSegmentSchema = z.strictObject({
  kind: z.literal("blank"),
  blank_id: nonEmptyStringSchema,
  group_key: z.string().regex(/^grp_[A-Za-z0-9_-]{22}$/),
});

const spellingItemSchema = z
  .strictObject({
    stage: z.literal("spelling"),
    item_id: nonEmptyStringSchema,
    entry_meaning: entryMeaningSchema,
    hint: z.strictObject({
      segments: z
        .array(z.union([hintTextSegmentSchema, hintBlankSegmentSchema]))
        .min(1),
    }),
  })
  .superRefine((value, context) => {
    if (!value.hint.segments.some((segment) => segment.kind === "blank"))
      context.addIssue({
        code: "custom",
        message: "spelling hint has no blank",
      });
  });

const passageItemSchema = z
  .strictObject({
    stage: z.literal("passage_cloze"),
    item_id: nonEmptyStringSchema,
    passage_segments: z
      .array(z.union([passageTextSegmentSchema, passageBlankSegmentSchema]))
      .min(1),
  })
  .superRefine((value, context) => {
    const ids = value.passage_segments
      .filter((segment) => segment.kind === "blank")
      .map((segment) => segment.blank_id);
    if (ids.length === 0 || new Set(ids).size !== ids.length)
      context.addIssue({
        code: "custom",
        message: "passage blanks are missing or duplicated",
      });
  });

export const reviewItemSchema = z.discriminatedUnion("stage", [
  spellingItemSchema,
  passageItemSchema,
]);
const itemProgressSchema = z
  .strictObject({
    stage: z.enum(["spelling", "passage_cloze"]),
    item_number: z.number().int().positive(),
    items_in_stage: z.number().int().positive(),
  })
  .superRefine((value, context) => {
    if (value.item_number > value.items_in_stage)
      context.addIssue({
        code: "custom",
        message: "item progress is inconsistent",
      });
  });

export const reviewAttemptEnvelopeSchema = successEnvelopeSchema(
  z
    .strictObject({
      attempt_id: nonEmptyStringSchema,
      attempt_token: nonEmptyStringSchema,
      item: reviewItemSchema,
      progress: itemProgressSchema,
    })
    .superRefine((value, context) => {
      if (value.item.stage !== value.progress.stage)
        context.addIssue({
          code: "custom",
          message: "item and progress stage disagree",
        });
    }),
);

const batchResultSchema = z
  .strictObject({
    batch_id: nonEmptyStringSchema,
    successful: z.boolean(),
    error_count: z.number().int().min(0),
    skip_count: z.number().int().min(0),
  })
  .superRefine((value, context) => {
    if (value.successful && value.skip_count !== 0)
      context.addIssue({
        code: "custom",
        message: "successful result has skips",
      });
  });

const retryOutcomeSchema = z
  .strictObject({
    outcome: z.literal("retry"),
    result: z.literal("incorrect"),
    item: reviewItemSchema,
    progress: itemProgressSchema,
    incorrect_blank_ids: z.array(nonEmptyStringSchema).min(1).nullable(),
  })
  .superRefine((value, context) => {
    if (
      (value.item.stage === "spelling") !==
      (value.incorrect_blank_ids === null)
    )
      context.addIssue({
        code: "custom",
        message: "incorrect blank ids disagree with stage",
      });
  });

const advancedOutcomeSchema = z.strictObject({
  outcome: z.literal("advanced"),
  result: z.enum(["correct", "skipped"]),
  item: reviewItemSchema,
  progress: itemProgressSchema,
});

const batchCompletedOutcomeSchema = z.strictObject({
  outcome: z.literal("batch_completed"),
  batch_result: batchResultSchema,
  session_progress: progressSchema,
  next_batch: batchProjectionSchema,
});

const sessionCompletedOutcomeSchema = z.strictObject({
  outcome: z.literal("session_completed"),
  batch_result: batchResultSchema,
  session_progress: progressSchema,
  next_batch: z.null(),
  session_summary: summarySchema,
});

export const reviewActionEnvelopeSchema = successEnvelopeSchema(
  z.discriminatedUnion("outcome", [
    retryOutcomeSchema,
    advancedOutcomeSchema,
    batchCompletedOutcomeSchema,
    sessionCompletedOutcomeSchema,
  ]),
);

export type ReviewRangePreviewDto = z.infer<
  typeof reviewRangePreviewEnvelopeSchema
>["data"];
export type ActiveRangeDto = z.infer<typeof activeRangeSchema>;
export type ReviewSessionDto = z.infer<typeof reviewSessionSchema>;
export type ReviewSessionCreatedDto = z.infer<
  typeof reviewSessionCreatedEnvelopeSchema
>["data"];
export type ReviewAttemptDto = z.infer<
  typeof reviewAttemptEnvelopeSchema
>["data"];
export type ReviewItemDto = z.infer<typeof reviewItemSchema>;
export type ReviewActionOutcomeDto = z.infer<
  typeof reviewActionEnvelopeSchema
>["data"];
