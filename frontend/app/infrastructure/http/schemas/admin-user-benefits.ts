import { z } from "zod";
import {
  nonEmptyStringSchema as str,
  planCodeSchema,
  rfc3339Schema as time,
  successEnvelopeSchema,
  listMetaSchema,
} from "./common";
import { quotaSchema, extraQuotaSchema } from "./generation";
import { amountSchema, signedAmountSchema, settlementSchema } from "./growth";
export const adminUserBenefitsEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({
    base_plan: z.strictObject({ code: planCodeSchema, quota: quotaSchema }),
    trial: z
      .strictObject({ code: planCodeSchema, ends_at: time, quota: quotaSchema })
      .nullable(),
    effective_origin: z.enum(["base", "trial"]),
    extra_quota: extraQuotaSchema,
  }),
);
export const adminLedgerEnvelopeSchema = z.strictObject({
  data: z.strictObject({
    balance: amountSchema,
    items: z.array(
      z.strictObject({
        id: str,
        settlement_id: str,
        kind: str,
        delta: signedAmountSchema,
        balance_after: amountSchema,
        created_at: time,
        admin_username: z.string().nullable().optional(),
      }),
    ),
  }),
  meta: listMetaSchema,
});
export const adminGrantEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({ receipt: settlementSchema }),
);
