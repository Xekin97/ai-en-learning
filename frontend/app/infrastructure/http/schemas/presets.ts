import { z } from "zod";
import {
  nonEmptyStringSchema as str,
  rfc3339Schema,
  meaningLanguageSchema,
  scenarioSchema,
  passageLengthSchema,
  listEnvelopeSchema,
  successEnvelopeSchema,
} from "./common";
import {
  generationValidatedEventSchema,
  quotaSchema,
  extraQuotaSchema,
} from "./generation";
export const presetSchema = z.strictObject({
  id: str,
  title: str,
  published_version: str,
  version_created_at: rfc3339Schema,
  configuration: z.strictObject({
    model: z.strictObject({ id: str, name: str }),
    entries: z.array(str).min(1),
    meaning_language: meaningLanguageSchema,
    scenario: scenarioSchema,
    length: passageLengthSchema,
  }),
  sample: generationValidatedEventSchema.shape.result,
  availability: z.union([
    z.strictObject({ can_generate: z.literal(true), reason: z.null() }),
    z.strictObject({
      can_generate: z.literal(false),
      reason: z.enum([
        "model_unavailable",
        "credential_missing",
        "configuration_invalid",
      ]),
    }),
  ]),
});
export const presetsEnvelopeSchema = listEnvelopeSchema(presetSchema);
export const presetDetailEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({
    preset: presetSchema,
    quota: quotaSchema,
    extra_quota: extraQuotaSchema,
    can_start: z.boolean(),
    block_reason: str.nullable(),
  }),
);
export type PresetDto = z.infer<typeof presetSchema>;
export type PresetDetailDto = z.infer<
  typeof presetDetailEnvelopeSchema
>["data"];
