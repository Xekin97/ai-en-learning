import type {
  PageModel,
  PlanCode,
  QuotaModel,
} from "@application/shared/models";
import type { SettlementModel } from "@application/growth/models";
export interface UserBenefitsModel {
  basePlan: { code: PlanCode; quota: QuotaModel };
  trial: { code: PlanCode; endsAt: string; quota: QuotaModel } | null;
  effectiveOrigin: "base" | "trial";
  extraQuota: { remaining: number; earliestExpiresAt: string | null };
}
export interface PointsLedgerRow {
  id: string;
  settlementId: string;
  kind: string;
  delta: string;
  balanceAfter: string;
  createdAt: string;
  adminUsername: string | null;
}
export interface AdminUserBenefitsPort {
  getUserBenefits(id: string): Promise<UserBenefitsModel>;
  listUserPoints(
    id: string,
    cursor?: string,
  ): Promise<PageModel<PointsLedgerRow> & { balance: string }>;
  grantUserPoints(
    id: string,
    points: string,
    reason: string,
    key: string,
  ): Promise<SettlementModel>;
}
