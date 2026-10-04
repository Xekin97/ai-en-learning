import type { z } from "zod";
import type { AdminUserBenefitsPort } from "@application/admin/user-benefits";
import type { QuotaModel } from "@application/shared/models";
import type { RawHttpTransport } from "../transports/transport";
import type { TokenVault } from "@runtime/session/token-vault";
import type { quotaSchema } from "../schemas/generation";
import {
  adminUserBenefitsEnvelopeSchema,
  adminLedgerEnvelopeSchema,
  adminGrantEnvelopeSchema,
} from "../schemas/admin-user-benefits";
import { mapSettlement } from "../mappers/growth-mapper";
import { json } from "./repository-support";
function quota(dto: z.infer<typeof quotaSchema>): QuotaModel {
  return dto.kind === "unlimited"
    ? { kind: "unlimited", windowHours: 24 }
    : {
        kind: "limited",
        limit: dto.limit,
        remaining: dto.remaining,
        windowHours: 24,
        refreshesAt: dto.refreshes_at,
      };
}
export function createAdminUserBenefitsRepository(
  transport: RawHttpTransport,
  vault: TokenVault,
): AdminUserBenefitsPort {
  const root = (id: string) => "/api/v1/admin/users/" + encodeURIComponent(id);
  return {
    async getUserBenefits(id) {
      const { data } = await json(
        transport,
        root(id) + "/benefits",
        adminUserBenefitsEnvelopeSchema,
      );
      return {
        basePlan: {
          code: data.base_plan.code,
          quota: quota(data.base_plan.quota),
        },
        trial: data.trial
          ? {
              code: data.trial.code,
              endsAt: data.trial.ends_at,
              quota: quota(data.trial.quota),
            }
          : null,
        effectiveOrigin: data.effective_origin,
        extraQuota: {
          remaining: data.extra_quota.remaining,
          earliestExpiresAt: data.extra_quota.earliest_expires_at,
        },
      };
    },
    async listUserPoints(id, cursor) {
      const query = new URLSearchParams({ limit: "100" });
      if (cursor) query.set("cursor", cursor);
      const { data, meta } = await json(
        transport,
        root(id) + "/points-ledger?" + query,
        adminLedgerEnvelopeSchema,
      );
      return {
        balance: data.balance,
        items: data.items.map((item) => ({
          id: item.id,
          settlementId: item.settlement_id,
          kind: item.kind,
          delta: item.delta,
          balanceAfter: item.balance_after,
          createdAt: item.created_at,
          adminUsername: item.admin_username ?? null,
        })),
        nextCursor: meta.next_cursor,
        hasMore: meta.has_more,
      };
    },
    async grantUserPoints(id, points, reason, key) {
      const { data } = await json(
        transport,
        root(id) + "/point-grants",
        adminGrantEnvelopeSchema,
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-csrf-token": vault.csrf(),
            "idempotency-key": key,
          },
          body: JSON.stringify({ points, reason }),
        },
      );
      return mapSettlement(data.receipt);
    },
  };
}
