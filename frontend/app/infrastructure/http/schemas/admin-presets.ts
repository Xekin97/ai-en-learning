import { z } from "zod";
import {
  nonEmptyStringSchema as str,
  rfc3339Schema as time,
  successEnvelopeSchema,
  listEnvelopeSchema,
} from "./common";
import { presetSchema } from "./presets";
import { generationValidatedEventSchema } from "./generation";
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
  configuration,
  draft_state: z.enum(["needs_preview", "preview_ready"]),
  has_unpublished_changes: z.boolean(),
  preview: z
    .strictObject({
      preview_run_id: str,
      completed_at: time,
      result,
      usage: usageSchema,
    })
    .nullable(),
  published: z
    .strictObject({
      title: str,
      configuration,
      sample: result,
      version_created_at: time,
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
export const previewStartedSchema = z.strictObject({
  preview_run_id: str,
  preview_token: str,
});
export const previewValidatedSchema = z.strictObject({
  preview_run_id: str,
  draft_version: str,
  result,
  usage: usageSchema,
});
export const previewFailedSchema = z.strictObject({
  code: str,
  retryable: z.boolean(),
  request_id: str,
});
export const previewCancelledSchema = z.strictObject({});
export const previewCancelEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({ status: z.enum(["cancelled", "valid", "failed"]) }),
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
