import type {
  AnalyticsEvent,
  FrontendPage,
} from "@application/analytics/models";
export function analyticsPage(path: string): FrontendPage | null {
  const fixed: Record<string, FrontendPage> = {
    "/": "PAGE-205",
    "/explore": "PAGE-217",
    "/create": "PAGE-204",
    "/login": "PAGE-003",
    "/register": "PAGE-002",
    "/library": "PAGE-005",
    "/review": "PAGE-007",
    "/account": "PAGE-206",
    "/account/growth": "PAGE-214",
    "/account/items": "PAGE-215",
    "/account/exchange": "PAGE-215",
    "/notices": "PAGE-207",
  };
  if (fixed[path]) return fixed[path];
  if (/^\/trial\/[^/]+$/.test(path)) return "PAGE-216";
  if (/^\/library\/[^/]+$/.test(path)) return "PAGE-006";
  if (/^\/review\/[^/]+$/.test(path)) return "PAGE-201";
  return null;
}
const clean = (value: string | null) =>
  value
    ? Array.from(value.replace(/[\p{Cc}\p{Cf}]/gu, ""))
        .slice(0, 128)
        .join("")
    : undefined;
export function analyticsSource(
  url: string,
  referrer: string,
): AnalyticsEvent["source"] {
  const entry = new URL(url),
    utmSource = clean(entry.searchParams.get("utm_source")),
    utmMedium = clean(entry.searchParams.get("utm_medium")),
    utmCampaign = clean(entry.searchParams.get("utm_campaign"));
  let referrerHost: string | undefined;
  try {
    const previous = new URL(referrer);
    if (
      previous.hostname !== entry.hostname &&
      /^https?:$/.test(previous.protocol)
    )
      referrerHost = clean(previous.hostname);
  } catch {
    /* A missing or invalid referrer is direct/unknown. */
  }
  return utmSource || utmMedium || utmCampaign || referrerHost
    ? {
        ...(utmSource ? { utmSource } : {}),
        ...(utmMedium ? { utmMedium } : {}),
        ...(utmCampaign ? { utmCampaign } : {}),
        ...(referrerHost ? { referrerHost } : {}),
      }
    : undefined;
}
