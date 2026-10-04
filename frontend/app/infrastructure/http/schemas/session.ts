import { z } from "zod";
import {
  nonEmptyStringSchema,
  planCodeSchema,
  successEnvelopeSchema,
  uiLocaleSchema,
  rfc3339Schema,
} from "./common";
const visitorActorSchema = z.strictObject({ kind: z.literal("visitor") });
const accountFields = {
  kind: z.literal("account"),
  id: nonEmptyStringSchema,
  username: nonEmptyStringSchema,
};
const learnerActorSchema = z.strictObject({
  ...accountFields,
  role: z.literal("learner"),
  plan_code: planCodeSchema,
});
const adminActorSchema = z.strictObject({
  ...accountFields,
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
  csrf_token: nonEmptyStringSchema,
});
export const bootstrapEnvelopeSchema =
  successEnvelopeSchema(bootstrapDataSchema);
export const authDataSchema = z.strictObject({
  actor: z.union([learnerActorSchema, adminActorSchema]),
  ui_locale: uiLocaleSchema,
  csrf_token: nonEmptyStringSchema,
});
export const welcomeSchema = z.discriminatedUnion("kind", [
  z.strictObject({
    kind: z.literal("no_learning"),
    display_name: nonEmptyStringSchema,
    days_since_learning: z.null(),
    previous_learning_at: z.null(),
  }),
  z.strictObject({
    kind: z.literal("same_day"),
    display_name: nonEmptyStringSchema,
    days_since_learning: z.literal(0),
    previous_learning_at: rfc3339Schema,
  }),
  z.strictObject({
    kind: z.literal("returning"),
    display_name: nonEmptyStringSchema,
    days_since_learning: z.number().int().safe().min(1),
    previous_learning_at: rfc3339Schema,
  }),
]);
export const authEnvelopeSchema = successEnvelopeSchema(authDataSchema);
export const loginDataSchema = authDataSchema.extend({
  welcome: welcomeSchema.nullable(),
});
export const loginEnvelopeSchema = successEnvelopeSchema(loginDataSchema);
export const localeEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({ ui_locale: uiLocaleSchema }),
);
export const accountSchema = z.strictObject({
  username: nonEmptyStringSchema,
  nickname: z.string().nullable(),
  display_name: nonEmptyStringSchema,
  gender: z.enum(["female", "male"]).nullable(),
  ui_locale: uiLocaleSchema,
  base_plan_code: planCodeSchema,
  effective_plan_code: planCodeSchema,
  last_login_at: rfc3339Schema.nullable(),
  last_learning_at: rfc3339Schema.nullable(),
});
export const accountEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({ account: accountSchema }),
);
export type BootstrapDto = z.infer<typeof bootstrapDataSchema>;
export type AuthDto = z.infer<typeof authDataSchema>;
export type LoginDto = z.infer<typeof loginDataSchema>;
export type AccountDto = z.infer<typeof accountEnvelopeSchema>["data"];
