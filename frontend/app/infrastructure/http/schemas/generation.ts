import { z } from "zod";
import {
  meaningLanguageSchema,
  groupCodeSchema,
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

export const quotaSchema = z.discriminatedUnion("kind", [
  limitedQuotaSchema,
  unlimitedQuotaSchema,
]);
export const extraQuotaSchema = z.strictObject({
  remaining: z.number().int().min(0),
  earliest_expires_at: rfc3339Schema.nullable(),
});
export const randomEntryEnvelopeSchema = successEnvelopeSchema(
  z.union([
    z.strictObject({ entry: nonEmptyStringSchema, reason: z.null() }),
    z.strictObject({
      entry: z.null(),
      reason: z.enum(["limit_reached", "no_candidates"]),
    }),
  ]),
);
const generationOptionsDataSchema = z.strictObject({
  models: z.array(
    z.strictObject({
      id: nonEmptyStringSchema,
      name: nonEmptyStringSchema,
      description: nullableStringSchema,
      access: z.strictObject({
        from_plan: z.boolean(),
        card_ends_at: rfc3339Schema.nullable(),
      }),
    }),
  ),
  meaning_languages: z.array(meaningLanguageSchema).min(1),
  scenarios: z.array(scenarioSchema).min(1),
  lengths: z.array(passageLengthSchema),
  max_entries: z.number().int().positive(),
  effective_plan: z.strictObject({
    code: groupCodeSchema,
    origin: z.enum(["base", "trial", "visitor"]),
    trial_ends_at: rfc3339Schema.nullable(),
  }),
  extra_quota: extraQuotaSchema,
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
  configuration_revision: nonEmptyStringSchema,
  content_service: z.union([
    z.strictObject({
      native_validation: z.literal(true),
      content_review_enabled: z.literal(false),
      content_repair_limit: z.literal(0),
    }),
    z.strictObject({
      native_validation: z.literal(true),
      content_review_enabled: z.literal(true),
      content_repair_limit: z.number().int().min(1).max(99),
    }),
  ]),
  native_correction_policy: z.strictObject({
    version: z.literal("m003-native-policy-v1"),
    scope: z.literal("logical_request"),
    max_calls: z.literal(2),
    editable: z.literal(false),
  }),
});
export const generationOptionsEnvelopeSchema = successEnvelopeSchema(
  generationOptionsDataSchema,
);

export const contentServiceSchema =
  generationOptionsDataSchema.shape.content_service;
export const nativePolicySchema =
  generationOptionsDataSchema.shape.native_correction_policy;
export const effectivePlanSchema =
  generationOptionsDataSchema.shape.effective_plan;
export const validContentOutcomeSchema = z.enum([
  "basic",
  "review_passed",
  "repaired_passed",
  "limit_finalized",
  "service_incomplete",
]);
export const completionNoticeSchema = z
  .literal("content_review_incomplete")
  .nullable();
const codePointString = (minimum: number, maximum: number) =>
  z.string().superRefine((value, context) => {
    const length = Array.from(value).length;
    if (length < minimum || length > maximum)
      context.addIssue({
        code: "custom",
        message: `expected ${minimum}..${maximum} Unicode code points`,
      });
  });
export const planPreviewItemSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("scene"), text: codePointString(1, 600) }),
  z.strictObject({
    kind: z.literal("word_use"),
    entry: nonEmptyStringSchema,
    form: codePointString(1, 128),
    sense: codePointString(1, 256),
    phrase: codePointString(1, 256),
  }),
]);
const seqSchema = z.number().int().positive();
const contentVersionSchema = z.number().int().min(1).max(101);
export const runSnapshotSchema = z.strictObject({
  configuration_revision: nonEmptyStringSchema,
  effective_plan: z.strictObject({
    code: groupCodeSchema,
    origin: z.enum(["base", "trial", "visitor"]),
  }),
  content_service: contentServiceSchema,
  native_correction_policy: nativePolicySchema,
});
export const generationStartedEventSchema = z.strictObject({
  seq: z.literal(1),
  contract_version: z.literal("m003-stream-v6"),
  stream_id: nonEmptyStringSchema,
  run_id: nonEmptyStringSchema,
  generation_token: nonEmptyStringSchema,
  snapshot: runSnapshotSchema,
});
export const generationProgressEventSchema = z.strictObject({
  seq: seqSchema,
  phase: z.enum(["planning", "composing", "finalizing"]),
});
export const generationPlanItemEventSchema = z.strictObject({
  seq: seqSchema,
  plan_id: nonEmptyStringSchema,
  meaning_language: meaningLanguageSchema,
  item: planPreviewItemSchema,
});
export const generationActivityEventSchema = z.strictObject({
  seq: seqSchema,
  activity: z.enum(["writing", "improving"]),
});
const draftCommonSchema = z.strictObject({
  seq: seqSchema,
  draft_id: nonEmptyStringSchema,
  content_version: contentVersionSchema,
  base_rev: z.number().int().nonnegative(),
});
export const generationDraftEventSchema = z.discriminatedUnion("action", [
  draftCommonSchema.extend({
    action: z.literal("begin"),
    mode: z.enum(["initial", "replace", "append", "restore"]),
  }),
  draftCommonSchema.extend({
    action: z.literal("paragraph_complete"),
    paragraph_index: z.number().int().nonnegative(),
  }),
  draftCommonSchema.extend({
    action: z.literal("body_complete"),
    body_length: z.number().int().nonnegative(),
    paragraph_count: z.number().int().nonnegative(),
  }),
  draftCommonSchema.extend({ action: z.literal("discard") }),
]);
export const generationEditEventSchema = z
  .strictObject({
    seq: seqSchema,
    draft_id: nonEmptyStringSchema,
    content_version: contentVersionSchema,
    base_rev: z.number().int().nonnegative(),
    rev: z.number().int().positive(),
    at: z.number().int().nonnegative(),
    delete_count: z.number().int().nonnegative(),
    insert: z.string(),
    source: z.enum(["provider", "retained"]),
  })
  .superRefine((value, context) => {
    if (Array.from(value.insert).length > 2_048)
      context.addIssue({
        code: "custom",
        path: ["insert"],
        message: "insert exceeds 2048 Unicode code points",
      });
  });

export const generationTargetSchema = z.strictObject({
  entry: nonEmptyStringSchema,
  entry_meaning: entryMeaningSchema,
  hint_phrase: nonEmptyStringSchema,
  hint_blanks: z.array(spanSchema).min(1),
  occurrences: z.array(occurrenceSchema).min(1),
});

export const generationValidatedEventSchema = z
  .strictObject({
    seq: seqSchema,
    run_id: nonEmptyStringSchema,
    final_content_version: contentVersionSchema,
    result: z.strictObject({
      passage: nonEmptyStringSchema,
      tags: z.array(nonEmptyStringSchema).min(1).max(3),
      targets: z.array(generationTargetSchema).min(1),
    }),
    content_outcome: validContentOutcomeSchema,
    completion_notice: completionNoticeSchema,
  })
  .superRefine((value, context) => {
    const incomplete = value.content_outcome === "service_incomplete";
    if (
      incomplete !==
      (value.completion_notice === "content_review_incomplete")
    )
      context.addIssue({
        code: "custom",
        path: ["completion_notice"],
        message: "notice/outcome mismatch",
      });
  });

export const generationFailedEventSchema = z.strictObject({
  seq: seqSchema,
  code: z.enum([
    "authentication",
    "authorization",
    "rate_limited",
    "provider_unavailable",
    "protocol_error",
    "schema_error",
    "content_validation_failed",
    "generation_timeout",
    "generation_failed",
  ]),
  quota_refunded: z.literal(true),
  retryable: z.boolean(),
  request_id: nonEmptyStringSchema,
});
export const generationCancelledEventSchema = z.strictObject({
  seq: seqSchema,
  quota_refunded: z.literal(false),
});
export const generationSettlementPendingEventSchema = z.strictObject({
  seq: seqSchema,
  code: z.literal("settlement_unconfirmed"),
  request_id: nonEmptyStringSchema,
});

export const generationStatusEnvelopeSchema = successEnvelopeSchema(
  z
    .strictObject({
      contract_version: z.literal("m003-stream-v6"),
      run_id: nonEmptyStringSchema,
      status: z.enum(["active", "valid", "failed", "cancelled"]),
      snapshot: runSnapshotSchema,
      final_content_version: contentVersionSchema.nullable(),
      result: generationValidatedEventSchema.shape.result.nullable(),
      content_outcome: z
        .union([validContentOutcomeSchema, z.enum(["failed", "cancelled"])])
        .nullable(),
      completion_notice: completionNoticeSchema,
      can_save: z.boolean(),
      quota_refunded: z.boolean(),
    })
    .superRefine((value, context) => {
      if (
        value.status === "active" &&
        (value.result !== null ||
          value.final_content_version !== null ||
          value.content_outcome !== null ||
          value.can_save ||
          value.quota_refunded)
      )
        context.addIssue({
          code: "custom",
          message: "active status exposes terminal facts",
        });
      if (
        value.status === "valid" &&
        (!value.content_outcome ||
          value.content_outcome === "failed" ||
          value.content_outcome === "cancelled")
      )
        context.addIssue({
          code: "custom",
          path: ["content_outcome"],
          message: "valid outcome missing",
        });
      if (value.status === "valid" && value.final_content_version === null)
        context.addIssue({
          code: "custom",
          path: ["final_content_version"],
          message: "valid version missing",
        });
      if (value.can_save && (value.status !== "valid" || value.result === null))
        context.addIssue({
          code: "custom",
          path: ["can_save"],
          message: "save requires full valid result",
        });
      const service = value.snapshot.content_service;
      if (value.status === "valid" && value.final_content_version !== null) {
        const max = service.content_review_enabled
          ? service.content_repair_limit + 2
          : 1;
        if (value.final_content_version > max)
          context.addIssue({
            code: "custom",
            path: ["final_content_version"],
            message: "version exceeds snapshot",
          });
        if (
          !service.content_review_enabled &&
          value.content_outcome !== "basic"
        )
          context.addIssue({
            code: "custom",
            path: ["content_outcome"],
            message: "basic snapshot mismatch",
          });
        if (service.content_review_enabled && value.content_outcome === "basic")
          context.addIssue({
            code: "custom",
            path: ["content_outcome"],
            message: "enhanced snapshot mismatch",
          });
      }
      const incomplete = value.content_outcome === "service_incomplete";
      if (
        incomplete !==
        (value.completion_notice === "content_review_incomplete")
      )
        context.addIssue({
          code: "custom",
          path: ["completion_notice"],
          message: "notice/outcome mismatch",
        });
    }),
);

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
    title: nonEmptyStringSchema,
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
    title: nonEmptyStringSchema,
  }),
);

export type VocabularyDto = z.infer<typeof vocabularyEnvelopeSchema>["data"];
export type GenerationOptionsDto = z.infer<typeof generationOptionsDataSchema>;
export type GenerationValidatedEventDto = z.infer<
  typeof generationValidatedEventSchema
>;
export type GenerationStartedEventDto = z.infer<
  typeof generationStartedEventSchema
>;
export type GenerationProgressEventDto = z.infer<
  typeof generationProgressEventSchema
>;
export type GenerationPlanItemEventDto = z.infer<
  typeof generationPlanItemEventSchema
>;
export type GenerationActivityEventDto = z.infer<
  typeof generationActivityEventSchema
>;
export type GenerationDraftEventDto = z.infer<
  typeof generationDraftEventSchema
>;
export type GenerationEditEventDto = z.infer<typeof generationEditEventSchema>;
export type GenerationStatusDto = z.infer<
  typeof generationStatusEnvelopeSchema
>["data"];
export type SpanDto = z.infer<typeof spanSchema>;
export type OccurrenceDto = z.infer<typeof occurrenceSchema>;
