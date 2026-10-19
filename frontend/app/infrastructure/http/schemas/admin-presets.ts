import { z } from "zod";
import {
  nonEmptyStringSchema as str,
  rfc3339Schema as time,
  successEnvelopeSchema,
  listEnvelopeSchema,
} from "./common";
import { presetSchema } from "./presets";
import {
  generationValidatedEventSchema,
  contentServiceSchema,
  nativePolicySchema,
  validContentOutcomeSchema,
  completionNoticeSchema,
  planPreviewItemSchema,
  generationActivityEventSchema,
  generationDraftEventSchema,
} from "./generation";
import { usageSchema } from "./analytics";
const configuration = presetSchema.shape.configuration,
  result = generationValidatedEventSchema.shape.result;
export const adminGenerationOptionsSchema = z
  .strictObject({
    models: z.array(
      z.strictObject({ id: str, name: str, description: str.nullable() }),
    ),
    meaning_languages: z.tuple([
      z.literal("zh"),
      z.literal("en"),
      z.literal("ja"),
    ]),
    scenarios: z.tuple([
      z.literal("discussion"),
      z.literal("story"),
      z.literal("business"),
      z.literal("news"),
    ]),
    lengths: z.tuple([
      z.literal("short"),
      z.literal("medium"),
      z.literal("long"),
      z.literal("xlong"),
    ]),
    vocabulary_version: str,
    revision: str,
    availability: z.union([
      z.strictObject({ can_preview: z.literal(true), reason: z.null() }),
      z.strictObject({
        can_preview: z.literal(false),
        reason: z.enum(["credential_missing", "no_models"]),
      }),
    ]),
    preview_content_modes: z.tuple([z.literal("basic"), z.literal("enhanced")]),
    default_preview_content_mode: z.literal("basic"),
    preview_content_repair_limit: z.literal(1),
    native_correction_policy: nativePolicySchema,
  })
  .refine(
    (d) =>
      new Set(d.models.map((m) => m.id)).size === d.models.length &&
      (!d.availability.can_preview || d.models.length > 0) &&
      (d.availability.reason !== "no_models" || d.models.length === 0),
    "Invalid model availability",
  );
export const adminPresetSchema = z.strictObject({
  id: str,
  draft_version: str,
  published_version: str.nullable(),
  listed: z.boolean(),
  title: str,
  preview_content_mode: z.enum(["basic", "enhanced"]),
  configuration,
  draft_state: z.enum(["needs_preview", "preview_ready"]),
  has_unpublished_changes: z.boolean(),
  preview: z
    .strictObject({
      preview_run_id: str,
      completed_at: time,
      result,
      usage: usageSchema,
      preview_content_mode: z.enum(["basic", "enhanced"]),
      final_content_version: z.number().int().min(1).max(3).nullable(),
      content_outcome: validContentOutcomeSchema.nullable(),
      completion_notice: completionNoticeSchema,
    })
    .nullable(),
  published: z
    .strictObject({
      title: str,
      configuration,
      sample: result,
      version_created_at: time,
      final_content_version: z.number().int().min(1).max(3).nullable(),
      content_outcome: validContentOutcomeSchema.nullable(),
      completion_notice: completionNoticeSchema,
    })
    .nullable(),
});
export const adminGenerationOptionsEnvelopeSchema = successEnvelopeSchema(
  adminGenerationOptionsSchema,
);
export const adminPresetEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({ preset: adminPresetSchema, revision: str }),
);
export const adminPresetsEnvelopeSchema = listEnvelopeSchema(
  adminPresetSchema,
).extend({
  data: z.strictObject({ items: z.array(adminPresetSchema), revision: str }),
});
export const previewStartedSchema = z
  .strictObject({
    seq: z.literal(1),
    contract_version: z.literal("m003-stream-v6"),
    stream_id: str,
    preview_run_id: str,
    preview_token: str,
    draft_version: str,
    preview_content_mode: z.enum(["basic", "enhanced"]),
    content_service: contentServiceSchema,
    native_correction_policy: nativePolicySchema,
  })
  .superRefine((value, context) => {
    const service = value.content_service;
    if (
      value.preview_content_mode === "basic" &&
      (service.content_review_enabled || service.content_repair_limit !== 0)
    )
      context.addIssue({
        code: "custom",
        path: ["content_service"],
        message: "basic preview service mismatch",
      });
    if (
      value.preview_content_mode === "enhanced" &&
      (!service.content_review_enabled || service.content_repair_limit !== 1)
    )
      context.addIssue({
        code: "custom",
        path: ["content_service"],
        message: "enhanced preview service mismatch",
      });
  });
export const previewValidatedSchema = z
  .strictObject({
    seq: z.number().int().positive(),
    preview_run_id: str,
    draft_version: str,
    preview_content_mode: z.enum(["basic", "enhanced"]),
    final_content_version: z.number().int().min(1).max(3),
    result,
    content_outcome: validContentOutcomeSchema,
    completion_notice: completionNoticeSchema,
    usage: usageSchema,
  })
  .superRefine((value, context) => {
    if (
      value.preview_content_mode === "basic" &&
      (value.final_content_version !== 1 || value.content_outcome !== "basic")
    )
      context.addIssue({
        code: "custom",
        message: "basic preview terminal mismatch",
      });
    if (
      value.preview_content_mode === "enhanced" &&
      value.content_outcome === "basic"
    )
      context.addIssue({
        code: "custom",
        path: ["content_outcome"],
        message: "enhanced preview terminal mismatch",
      });
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
export const previewFailedSchema = z.strictObject({
  seq: z.number().int().positive(),
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
  retryable: z.boolean(),
  request_id: str,
});
export const previewCancelledSchema = z.strictObject({
  seq: z.number().int().positive(),
});
export const previewProgressSchema = z.strictObject({
  seq: z.number().int().positive(),
  phase: z.enum(["planning", "composing", "finalizing"]),
});
export const previewPlanItemSchema = z.strictObject({
  seq: z.number().int().positive(),
  plan_id: str,
  meaning_language: z.enum(["zh", "en", "ja"]),
  item: planPreviewItemSchema,
});
export const previewActivitySchema = generationActivityEventSchema;
export const previewDraftSchema = generationDraftEventSchema;
export const previewEditSchema = z
  .strictObject({
    seq: z.number().int().positive(),
    draft_id: str,
    content_version: z.number().int().min(1).max(3),
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
export const previewSettlementPendingSchema = z.strictObject({
  seq: z.number().int().positive(),
  code: z.literal("settlement_unconfirmed"),
  request_id: str,
});
export const previewCancelEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({ status: z.enum(["cancelled", "valid", "failed"]) }),
);
export const previewStatusEnvelopeSchema = successEnvelopeSchema(
  z
    .strictObject({
      contract_version: z.literal("m003-stream-v6"),
      preview_run_id: str,
      status: z.enum(["active", "valid", "failed", "cancelled"]),
      draft_version: str,
      preview_content_mode: z.enum(["basic", "enhanced"]),
      final_content_version: z.number().int().min(1).max(3).nullable(),
      result: result.nullable(),
      content_outcome: z
        .union([validContentOutcomeSchema, z.enum(["failed", "cancelled"])])
        .nullable(),
      completion_notice: completionNoticeSchema,
      usage: usageSchema,
    })
    .superRefine((value, context) => {
      if (
        value.status === "active" &&
        (value.final_content_version !== null ||
          value.result !== null ||
          value.content_outcome !== null ||
          value.completion_notice !== null)
      )
        context.addIssue({
          code: "custom",
          message: "active preview exposes terminal facts",
        });
      if (
        (value.status === "failed" || value.status === "cancelled") &&
        (value.final_content_version !== null ||
          value.result !== null ||
          value.content_outcome !== value.status ||
          value.completion_notice !== null)
      )
        context.addIssue({
          code: "custom",
          message: "preview failure terminal mismatch",
        });
      if (value.status === "valid") {
        if (
          value.final_content_version === null ||
          !value.content_outcome ||
          value.content_outcome === "failed" ||
          value.content_outcome === "cancelled"
        )
          context.addIssue({
            code: "custom",
            message: "valid preview terminal missing",
          });
        if (
          value.preview_content_mode === "basic" &&
          (value.final_content_version !== 1 ||
            value.content_outcome !== "basic")
        )
          context.addIssue({
            code: "custom",
            message: "basic preview status mismatch",
          });
        if (
          value.preview_content_mode === "enhanced" &&
          value.content_outcome === "basic"
        )
          context.addIssue({
            code: "custom",
            message: "enhanced preview status mismatch",
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
export const previewUsageSchema = z.strictObject({
  preview_run_id: str,
  preset_id: str.nullable(),
  draft_version: str.nullable(),
  status: z.enum(["active", "valid", "failed", "cancelled"]),
  started_at: time,
  completed_at: time.nullable(),
  usage: usageSchema,
});
export const previewUsageEnvelopeSchema = listEnvelopeSchema(
  previewUsageSchema,
).extend({
  data: z.strictObject({
    summary: usageSchema,
    items: z.array(previewUsageSchema),
  }),
});
export type AdminPresetDto = z.infer<typeof adminPresetSchema>;
export type AdminGenerationOptionsDto = z.infer<
  typeof adminGenerationOptionsSchema
>;
