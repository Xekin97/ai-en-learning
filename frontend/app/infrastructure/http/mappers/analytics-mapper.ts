import type {
  MetricDto,
  TrafficDto,
  FunnelDto,
  RetentionDto,
  OverviewDto,
  UsageDto,
} from "../schemas/analytics";
import type {
  MetricModel,
  TrafficModel,
  FunnelModel,
  RetentionModel,
  OverviewModel,
  AnalyticsBase,
} from "@application/analytics/models";
import type { UsageSummaryModel } from "@application/admin/usage";
export const mapMetric = (m: MetricDto): MetricModel => ({
  value: m.value,
  numerator: m.numerator,
  denominator: m.denominator,
  status: m.status,
  reason: m.reason,
});
export const mapUsage = (v: UsageDto): UsageSummaryModel => ({
  logicalRuns: v.logical_runs,
  providerCalls: v.provider_calls,
  inputTokens: v.input_tokens,
  outputTokens: v.output_tokens,
  cost: v.cost ? { amount: v.cost.amount, unit: v.cost.unit } : null,
  unknownCalls: v.unknown_calls,
});
const base = (
  d: TrafficDto | FunnelDto | RetentionDto | OverviewDto,
): AnalyticsBase => ({
  range: { startDay: d.range.start_day, endDay: d.range.end_day },
  learningDay: d.learning_day,
  updatedAt: d.updated_at,
  freshness: d.freshness,
  detailAvailableFrom: d.detail_available_from,
});
export function mapTraffic(d: TrafficDto): TrafficModel {
  let url: string | null = null;
  if (d.clarity.available && d.clarity.url) {
    const parsed = new URL(d.clarity.url);
    if (
      parsed.protocol === "https:" &&
      !parsed.username &&
      !parsed.password &&
      (parsed.hostname === "clarity.microsoft.com" ||
        parsed.hostname === "www.clarity.ms")
    )
      url = parsed.href;
  }
  return {
    ...base(d),
    pv: mapMetric(d.pv),
    uv: mapMetric(d.uv),
    bounceRate: mapMetric(d.bounce_rate),
    series: d.series.map((p) => ({
      day: p.day,
      pv: mapMetric(p.pv),
      uv: mapMetric(p.uv),
      bounceRate: mapMetric(p.bounce_rate),
    })),
    channels: d.channels.map((c) => ({
      sourceType: c.source_type,
      pv: mapMetric(c.pv),
      uv: mapMetric(c.uv),
    })),
    clarity: { available: url !== null, url },
  };
}
export function mapFunnel(d: FunnelDto): FunnelModel {
  return {
    ...base(d),
    registration: {
      convertedVisitorUv: mapMetric(d.registration.converted_visitor_uv),
      anonymousUv: mapMetric(d.registration.anonymous_uv),
      rate: mapMetric(d.registration.rate),
      newAccounts: mapMetric(d.registration.new_accounts),
      unattributedAccounts: mapMetric(d.registration.unattributed_accounts),
    },
    activation: {
      within7Days: mapMetric(d.activation.within_7_days),
      sameDay: mapMetric(d.activation.same_day),
      cohorts: d.activation.cohorts.map((c) => ({
        registrationDay: c.registration_day,
        rate: mapMetric(c.rate),
      })),
    },
    review: {
      started: mapMetric(d.review.started),
      submitted: mapMetric(d.review.submitted),
      successful: mapMetric(d.review.successful),
      completionRate: mapMetric(d.review.completion_rate),
      successRate: mapMetric(d.review.success_rate),
    },
    generation: {
      valid: mapMetric(d.generation.valid),
      failed: mapMetric(d.generation.failed),
      cancelled: mapMetric(d.generation.cancelled),
      ongoing: mapMetric(d.generation.ongoing),
      precheckRejected: mapMetric(d.generation.precheck_rejected),
      failureRate: mapMetric(d.generation.failure_rate),
    },
  };
}
export function mapRetention(d: RetentionDto): RetentionModel {
  return {
    ...base(d),
    cohorts: d.cohorts.map((c) => ({
      registrationDay: c.registration_day,
      accounts: c.accounts,
      d1: mapMetric(c.d1),
      d7: mapMetric(c.d7),
      d30: mapMetric(c.d30),
    })),
    series: d.series.map((s) => ({
      day: s.day,
      wau: mapMetric(s.wau),
      validGenerations: mapMetric(s.valid_generations),
      savedPassages: mapMetric(s.saved_passages),
      reviewSubmissions: mapMetric(s.review_submissions),
      successfulReviews: mapMetric(s.successful_reviews),
      reviewsPerActiveLearner: mapMetric(s.reviews_per_active_learner),
    })),
  };
}
export function mapOverview(d: OverviewDto): OverviewModel {
  return {
    ...base(d),
    today: {
      pv: mapMetric(d.today.pv),
      uv: mapMetric(d.today.uv),
      validGenerations: mapMetric(d.today.valid_generations),
      savedPassages: mapMetric(d.today.saved_passages),
      reviewSubmissions: mapMetric(d.today.review_submissions),
    },
    last7Days: {
      wau: mapMetric(d.last_7_days.wau),
      registrationRate: mapMetric(d.last_7_days.registration_rate),
      activationRate: mapMetric(d.last_7_days.activation_rate),
      generationFailureRate: mapMetric(d.last_7_days.generation_failure_rate),
    },
    previewUsage: mapUsage(d.preview_usage),
  };
}
