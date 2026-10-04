import { z } from "zod";
import {
  dateSchema,
  nonEmptyStringSchema as str,
  entryMeaningSchema,
  rfc3339Schema,
  scenarioSchema,
  successEnvelopeSchema,
} from "./common";
export const progressSchema = z
  .strictObject({
    completed_batches: z.number().int().min(0),
    total_batches: z.number().int().positive(),
    successful_batches: z.number().int().min(0),
    unsuccessful_batches: z.number().int().min(0),
    skipped_batches: z.number().int().min(0),
  })
  .refine(
    (v) =>
      v.successful_batches + v.unsuccessful_batches === v.completed_batches &&
      v.completed_batches <= v.total_batches &&
      v.skipped_batches <= v.unsuccessful_batches,
  );
const rangeSchema = z.strictObject({
  start_date: dateSchema,
  end_date: dateSchema,
  timezone: str,
});
export const reviewSessionSchema = z
  .strictObject({
    session_id: str,
    mode: z.enum(["range", "single_batch"]),
    status: z.enum(["active", "completed", "abandoned"]),
    date_range: rangeSchema.nullable(),
    progress: progressSchema,
    current_batch: z
      .strictObject({
        batch_id: str,
        saved_at: rfc3339Schema,
        scenario: scenarioSchema,
      })
      .nullable(),
    current_attempt: z
      .strictObject({
        attempt_id: str,
        revision: str,
        state: z.literal("draft"),
      })
      .nullable(),
  })
  .refine(
    (v) =>
      (v.mode === "range") === (v.date_range !== null) &&
      (v.status === "active"
        ? v.current_batch !== null
        : v.current_batch === null && v.current_attempt === null),
  );
export const reviewRangePreviewEnvelopeSchema = successEnvelopeSchema(
  z
    .strictObject({
      batch_count: z.number().int().min(0),
      entry_count: z.number().int().min(0),
      empty: z.boolean(),
    })
    .refine((v) => v.empty === (v.batch_count === 0 && v.entry_count === 0)),
);
export const activeRangeEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({
    session: reviewSessionSchema
      .refine((v) => v.mode === "range" && v.status === "active")
      .nullable(),
  }),
);
export const reviewSessionEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({ session: reviewSessionSchema, session_revision: str }),
);
export const reviewSessionCreatedEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({ session: reviewSessionSchema, reused: z.boolean() }),
);
export const reviewReplaceEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({ session: reviewSessionSchema, replaced_session_id: str }),
);
const text = z.strictObject({ kind: z.literal("text"), text: z.string() });
const slot = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("letters"),
    count: z.number().int().positive(),
  }),
  z.strictObject({ kind: z.literal("separator"), text: str }),
]);
const word = z
  .strictObject({
    question_id: str,
    entry_meaning: entryMeaningSchema,
    slots: z.array(slot).min(1),
    hint: z.strictObject({
      segments: z
        .array(
          z.discriminatedUnion("kind", [
            text,
            z.strictObject({ kind: z.literal("blank") }),
          ]),
        )
        .min(1),
    }),
  })
  .refine(
    (v) =>
      v.slots.some((s) => s.kind === "letters") &&
      v.hint.segments.some((s) => s.kind === "blank"),
  );
export const draftAttemptSchema = z
  .strictObject({
    attempt_id: str,
    session_id: str,
    batch_id: str,
    revision: str,
    attempt_token: str,
    token_expires_at: rfc3339Schema,
    words: z.array(word).min(1),
    passage: z.strictObject({
      segments: z
        .array(
          z.discriminatedUnion("kind", [
            text,
            z.strictObject({
              kind: z.literal("blank"),
              blank_id: str,
              group_key: z.string().regex(/^grp_[A-Za-z0-9_-]{22}$/),
            }),
          ]),
        )
        .min(1),
    }),
  })
  .refine(
    (v) =>
      new Set(v.words.map((w) => w.question_id)).size === v.words.length &&
      new Set(
        v.passage.segments.flatMap((s) =>
          s.kind === "blank" ? [s.blank_id] : [],
        ),
      ).size === v.passage.segments.filter((s) => s.kind === "blank").length,
  );
export const reviewAttemptEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({ attempt: draftAttemptSchema }),
);
export const receiptSchema = z.strictObject({
  attempt_id: str,
  batch_id: str,
  revision: str,
  submitted_at: rfc3339Schema,
  successful: z.boolean(),
  has_answer: z.boolean().nullable(),
});
const answer = {
  input: z.string(),
  correct: str,
  result: z.enum(["correct", "incorrect", "unanswered"]),
};
export const comparisonSchema = z.strictObject({
  words: z.array(z.strictObject({ question_id: str, ...answer })).min(1),
  passage_segments: z
    .array(
      z.discriminatedUnion("kind", [
        text,
        z.strictObject({ kind: z.literal("answer"), blank_id: str, ...answer }),
      ]),
    )
    .min(1),
});
const amount = z
  .string()
  .regex(/^(0|[1-9]\d*)$/)
  .refine((value) => BigInt(value) <= 9223372036854775807n);
export const reviewSubmitEnvelopeSchema = successEnvelopeSchema(
  z.discriminatedUnion("outcome", [
    z.strictObject({
      outcome: z.literal("submitted"),
      receipt: receiptSchema,
      session: reviewSessionSchema,
      comparison: comparisonSchema,
      growth: z.strictObject({
        new_masteries: z.number().int().min(0),
        experience_added: amount,
        points_added: amount,
      }),
    }),
    z.strictObject({
      outcome: z.literal("already_submitted"),
      receipt: receiptSchema,
      session: reviewSessionSchema,
    }),
  ]),
);
export const reviewReadEnvelopeSchema = successEnvelopeSchema(
  z.discriminatedUnion("state", [
    z.strictObject({ state: z.literal("draft"), attempt: draftAttemptSchema }),
    z.strictObject({
      state: z.literal("submitted"),
      receipt: receiptSchema,
      session: reviewSessionSchema,
    }),
    z.strictObject({
      state: z.literal("restarted"),
      session: reviewSessionSchema,
    }),
  ]),
);
export const reviewRestartEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({ attempt: draftAttemptSchema, session: reviewSessionSchema }),
);
export type SessionDto = z.infer<typeof reviewSessionSchema>;
export type DraftAttemptDto = z.infer<typeof draftAttemptSchema>;
export type ReceiptDto = z.infer<typeof receiptSchema>;
export type SubmitDto = z.infer<typeof reviewSubmitEnvelopeSchema>["data"];
