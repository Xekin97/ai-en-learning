import { z } from "zod";
import {
  nonEmptyStringSchema as str,
  rfc3339Schema as time,
  successEnvelopeSchema,
  listMetaSchema,
} from "./common";
export const bilingualSchema = z.strictObject({
  zh_CN: z.string().nullable(),
  en_US: z.string().nullable(),
});
export const adminNoticeSchema = z.strictObject({
  id: str,
  title: bilingualSchema,
  body_markdown: bilingualSchema,
  visible: z.boolean(),
  remind: z.boolean(),
  remind_once: z.boolean().default(false),
  published_at: time,
  updated_at: time,
});
export const adminNoticesEnvelopeSchema = z.strictObject({
  data: z.strictObject({ items: z.array(adminNoticeSchema), revision: str }),
  meta: listMetaSchema,
});
export const adminNoticeEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({ notice: adminNoticeSchema, revision: str }),
);
export const adminNoticePreviewEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({ body_html: z.string() }),
);
export type AdminNoticeDto = z.infer<typeof adminNoticeSchema>;
