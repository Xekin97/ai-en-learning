import type { AnalyticsPort } from "@application/analytics/models";
import type { RawHttpTransport } from "../transports/transport";
import type { TokenVault } from "@runtime/session/token-vault";
import {
  trafficEnvelopeSchema,
  funnelEnvelopeSchema,
  retentionEnvelopeSchema,
  overviewEnvelopeSchema,
} from "../schemas/analytics";
import {
  mapTraffic,
  mapFunnel,
  mapRetention,
  mapOverview,
} from "../mappers/analytics-mapper";
import { json, noContent } from "./repository-support";
export function createAnalyticsRepository(
  transport: RawHttpTransport,
  vault: TokenVault,
): AnalyticsPort {
  const query = (start: string, end: string) =>
    "?" + new URLSearchParams({ start_day: start, end_day: end });
  return {
    async getOverview() {
      return mapOverview(
        (
          await json(
            transport,
            "/api/v1/admin/overview",
            overviewEnvelopeSchema,
          )
        ).data,
      );
    },
    async getTraffic(start, end) {
      return mapTraffic(
        (
          await json(
            transport,
            "/api/v1/admin/analytics/traffic" + query(start, end),
            trafficEnvelopeSchema,
          )
        ).data,
      );
    },
    async getFunnel(start, end) {
      return mapFunnel(
        (
          await json(
            transport,
            "/api/v1/admin/analytics/funnel" + query(start, end),
            funnelEnvelopeSchema,
          )
        ).data,
      );
    },
    async getRetention(start, end) {
      return mapRetention(
        (
          await json(
            transport,
            "/api/v1/admin/analytics/retention" + query(start, end),
            retentionEnvelopeSchema,
          )
        ).data,
      );
    },
    async recordAnalytics(event) {
      const source = event.source;
      await noContent(transport, "/api/v1/analytics/events", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-csrf-token": vault.csrf(),
        },
        body: JSON.stringify({
          event_id: event.eventId,
          page: event.page,
          kind: event.kind,
          ...(event.kind === "key_action" ? { action: event.action } : {}),
          ...(source
            ? {
                source: {
                  ...(source.utmSource ? { utm_source: source.utmSource } : {}),
                  ...(source.utmMedium ? { utm_medium: source.utmMedium } : {}),
                  ...(source.utmCampaign
                    ? { utm_campaign: source.utmCampaign }
                    : {}),
                  ...(source.referrerHost
                    ? { referrer_host: source.referrerHost }
                    : {}),
                },
              }
            : {}),
        }),
      });
    },
  };
}
