import { z } from "zod";
import {
  nonEmptyStringSchema,
  rfc3339Schema,
  uiLocaleSchema,
  listEnvelopeSchema,
  successEnvelopeSchema,
} from "./common";
export const noticeSchema = z.strictObject({
  id: nonEmptyStringSchema,
  title: z.string(),
  body_html: z.string(),
  content_locale: uiLocaleSchema,
  remind: z.boolean(),
  remind_once: z.boolean().default(false),
  published_at: rfc3339Schema,
  revision: nonEmptyStringSchema,
});
export const noticesEnvelopeSchema = listEnvelopeSchema(noticeSchema);
export const noticeEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({ notice: noticeSchema }),
);
export type NoticeDto = z.infer<typeof noticeSchema>;
