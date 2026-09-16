import { z } from "zod";
import {
  nonEmptyStringSchema,
  planCodeSchema,
  successEnvelopeSchema,
  uiLocaleSchema,
} from "./common";

const visitorActorSchema = z.strictObject({
  kind: z.literal("visitor"),
  username: z.null(),
  role: z.null(),
  plan_code: z.null(),
});

const learnerActorSchema = z.strictObject({
  kind: z.literal("account"),
  username: nonEmptyStringSchema,
  role: z.literal("learner"),
  plan_code: planCodeSchema,
});

const adminActorSchema = z.strictObject({
  kind: z.literal("account"),
  username: nonEmptyStringSchema,
  role: z.literal("admin"),
  plan_code: z.null(),
});

export const actorSchema = z.union([
  visitorActorSchema,
  learnerActorSchema,
  adminActorSchema,
]);

export const bootstrapDataSchema = z.strictObject({
  actor: actorSchema,
  ui_locale: uiLocaleSchema.nullable(),
  supported_ui_locales: z.array(uiLocaleSchema).min(2),
  csrf_token: nonEmptyStringSchema,
});
export const bootstrapEnvelopeSchema =
  successEnvelopeSchema(bootstrapDataSchema);

export const authDataSchema = z.strictObject({
  actor: z.union([learnerActorSchema, adminActorSchema]),
  ui_locale: uiLocaleSchema,
  csrf_token: nonEmptyStringSchema,
});
export const authEnvelopeSchema = successEnvelopeSchema(authDataSchema);

export const localeEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({ ui_locale: uiLocaleSchema }),
);

export const accountEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({
    username: nonEmptyStringSchema,
    plan_code: planCodeSchema,
    ui_locale: uiLocaleSchema,
  }),
);

export type BootstrapDto = z.infer<typeof bootstrapDataSchema>;
export type AuthDto = z.infer<typeof authDataSchema>;
export type AccountDto = z.infer<typeof accountEnvelopeSchema>["data"];
