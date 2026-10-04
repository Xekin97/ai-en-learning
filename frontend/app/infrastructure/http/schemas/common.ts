import { z } from "zod";

export const nonEmptyStringSchema = z.string().min(1);
// The API limit is Unicode code points, not JavaScript UTF-16 code units.
// Validate without trimming, truncating, translating or otherwise changing it.
export const entryMeaningSchema = z
  .string()
  .refine(
    (value) =>
      value.length > 0 &&
      value.trim() === value &&
      Array.from(value).length <= 500,
    { message: "Invalid original-entry meaning" },
  );
export const nullableStringSchema = z.string().min(1).nullable();
export const rfc3339Schema = z.string().datetime({ offset: true });
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
export const uiLocaleSchema = z.enum(["zh-CN", "en-US"]);
export const planCodeSchema = z.enum(["basic", "pro", "plus"]);
export const groupCodeSchema = z.enum(["visitor", "basic", "pro", "plus"]);
export const meaningLanguageSchema = z.enum(["zh", "en", "ja"]);
export const scenarioSchema = z.enum([
  "discussion",
  "story",
  "business",
  "news",
]);
export const passageLengthSchema = z.enum(["short", "medium", "long", "xlong"]);

export const responseMetaSchema = z.strictObject({
  request_id: nonEmptyStringSchema,
});
export const listMetaSchema = z
  .strictObject({
    request_id: nonEmptyStringSchema,
    next_cursor: nullableStringSchema,
    has_more: z.boolean(),
  })
  .superRefine((value, context) => {
    if (value.has_more !== (value.next_cursor !== null)) {
      context.addIssue({
        code: "custom",
        message: "has_more and next_cursor disagree",
      });
    }
  });

export function successEnvelopeSchema<T extends z.ZodType>(data: T) {
  return z.strictObject({ data, meta: responseMetaSchema });
}

export function listEnvelopeSchema<T extends z.ZodType>(item: T) {
  return z.strictObject({
    data: z.strictObject({ items: z.array(item) }),
    meta: listMetaSchema,
  });
}

export const problemSchema = z.strictObject({
  context: z.record(z.string(), z.unknown()).optional(),
  type: nonEmptyStringSchema,
  title: nonEmptyStringSchema,
  status: z.number().int().min(400).max(599),
  code: nonEmptyStringSchema,
  detail: nonEmptyStringSchema,
  request_id: nonEmptyStringSchema,
  field_errors: z
    .array(
      z.strictObject({
        field: nonEmptyStringSchema,
        code: nonEmptyStringSchema,
      }),
    )
    .optional(),
});

export type ProblemDto = z.infer<typeof problemSchema>;
