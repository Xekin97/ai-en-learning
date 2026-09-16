export type AuthTarget = "review" | "library" | "story" | "account";
export interface LearnerReturnIntent {
  target: AuthTarget;
  to: { path: string; query: Record<string, string> };
  href: string;
}
export function safePathSegment(value: unknown): string | null {
  if (
    typeof value !== "string" ||
    !value ||
    value === "." ||
    value === ".." ||
    /[\s/%\\?#]/u.test(value) ||
    [...value].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    return null;
  return value;
}
export function safeSearchQuery(value: unknown): string {
  return typeof value === "string" &&
    /^[A-Za-z0-9_\s]*$/.test(value) &&
    value.trim().length <= 32
    ? value.trim()
    : "";
}
export function safeReturnIntent(value: unknown): LearnerReturnIntent | null {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\s]/u.test(value) ||
    [...value].some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  )
    return null;
  try {
    const rawPath = value.split(/[?#]/u)[0]!;
    const segments = rawPath
      .slice(1)
      .split("/")
      .map((s) => decodeURIComponent(s));
    if (segments.some((s) => !safePathSegment(s))) return null;
    const [area, id] = segments;
    if (
      !["library", "review", "account"].includes(area ?? "") ||
      segments.length > 2 ||
      (area === "account" && id)
    )
      return null;
    const query: Record<string, string> = {};
    const parsed = new URL(value, "https://wordweave.invalid");
    if (area === "review" && id) {
      const batch = parsed.searchParams.getAll("batch");
      if (
        batch.length > 1 ||
        (batch.length === 1 && !safePathSegment(batch[0]))
      )
        return null;
      if (batch[0]) query.batch = batch[0];
    }
    const path = "/" + segments.map((s) => encodeURIComponent(s)).join("/");
    const suffix = new URLSearchParams(query).toString();
    return {
      target:
        area === "library"
          ? id
            ? "story"
            : "library"
          : area === "review"
            ? "review"
            : "account",
      to: { path, query },
      href: path + (suffix ? "?" + suffix : ""),
    };
  } catch {
    return null;
  }
}
export function authenticationDestination(
  isAdmin: boolean,
  intent: LearnerReturnIntent | null,
) {
  return isAdmin
    ? { path: "/admin/models", query: {} }
    : (intent?.to ?? { path: "/library", query: {} });
}
