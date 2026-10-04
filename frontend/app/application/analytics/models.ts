import type { UsageSummaryModel } from "@application/admin/usage";
export interface MetricModel {
  value: number | null;
  numerator: number | null;
  denominator: number | null;
  status: "ready" | "no_sample" | "observing" | "unavailable";
  reason: "detail_expired" | "source_unavailable" | null;
}
export interface AnalyticsBase {
  range: { startDay: string; endDay: string };
  learningDay: string;
  updatedAt: string | null;
  freshness: "current" | "delayed" | "no_data";
  detailAvailableFrom: string;
}
export interface TrafficModel extends AnalyticsBase {
  pv: MetricModel;
  uv: MetricModel;
  bounceRate: MetricModel;
  series: {
    day: string;
    pv: MetricModel;
    uv: MetricModel;
    bounceRate: MetricModel;
  }[];
  channels: {
    sourceType: "utm" | "referrer" | "direct_unknown";
    pv: MetricModel;
    uv: MetricModel;
  }[];
  clarity: { available: boolean; url: string | null };
}
export interface FunnelModel extends AnalyticsBase {
  registration: {
    convertedVisitorUv: MetricModel;
    anonymousUv: MetricModel;
    rate: MetricModel;
    newAccounts: MetricModel;
    unattributedAccounts: MetricModel;
  };
  activation: {
    within7Days: MetricModel;
    sameDay: MetricModel;
    cohorts: { registrationDay: string; rate: MetricModel }[];
  };
  review: {
    started: MetricModel;
    submitted: MetricModel;
    successful: MetricModel;
    completionRate: MetricModel;
    successRate: MetricModel;
  };
  generation: {
    valid: MetricModel;
    failed: MetricModel;
    cancelled: MetricModel;
    ongoing: MetricModel;
    precheckRejected: MetricModel;
    failureRate: MetricModel;
  };
}
export interface RetentionModel extends AnalyticsBase {
  cohorts: {
    registrationDay: string;
    accounts: number;
    d1: MetricModel;
    d7: MetricModel;
    d30: MetricModel;
  }[];
  series: {
    day: string;
    wau: MetricModel;
    validGenerations: MetricModel;
    savedPassages: MetricModel;
    reviewSubmissions: MetricModel;
    successfulReviews: MetricModel;
    reviewsPerActiveLearner: MetricModel;
  }[];
}
export interface OverviewModel extends AnalyticsBase {
  today: {
    pv: MetricModel;
    uv: MetricModel;
    validGenerations: MetricModel;
    savedPassages: MetricModel;
    reviewSubmissions: MetricModel;
  };
  last7Days: {
    wau: MetricModel;
    registrationRate: MetricModel;
    activationRate: MetricModel;
    generationFailureRate: MetricModel;
  };
  previewUsage: UsageSummaryModel;
}
export type FrontendPage =
  | "PAGE-002"
  | "PAGE-003"
  | "PAGE-005"
  | "PAGE-006"
  | "PAGE-007"
  | "PAGE-008"
  | "PAGE-201"
  | "PAGE-202"
  | "PAGE-203"
  | "PAGE-204"
  | "PAGE-205"
  | "PAGE-206"
  | "PAGE-207"
  | "PAGE-214"
  | "PAGE-215"
  | "PAGE-216"
  | "PAGE-217";
export type AnalyticsAction =
  "select_word" | "start_generation" | "submit_registration" | "start_review";
export type AnalyticsEvent = {
  eventId: string;
  page: FrontendPage;
  source?: {
    utmSource?: string;
    utmMedium?: string;
    utmCampaign?: string;
    referrerHost?: string;
  };
} & ({ kind: "page_view" } | { kind: "key_action"; action: AnalyticsAction });
export interface AnalyticsPort {
  getOverview(): Promise<OverviewModel>;
  getTraffic(start: string, end: string): Promise<TrafficModel>;
  getFunnel(start: string, end: string): Promise<FunnelModel>;
  getRetention(start: string, end: string): Promise<RetentionModel>;
  recordAnalytics(event: AnalyticsEvent): Promise<void>;
}
