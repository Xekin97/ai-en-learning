import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn((to: unknown) => to);
const session = {
  load: vi.fn(async () => {}),
  state: { value: { status: "ready" } },
  actor: { value: { kind: "visitor" } },
  isAdmin: { value: false },
};
let guard: (to: { fullPath: string }) => Promise<unknown>;
beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  session.state.value.status = "ready";
  session.actor.value.kind = "visitor";
  session.isAdmin.value = false;
  vi.stubGlobal("useSessionStore", () => session);
  vi.stubGlobal("navigateTo", navigate);
  vi.stubGlobal(
    "defineNuxtRouteMiddleware",
    (handler: typeof guard) => handler,
  );
  guard = (await import("../../app/middleware/learner-login"))
    .default as unknown as typeof guard;
});
afterEach(() => vi.unstubAllGlobals());

describe("learner entry authentication", () => {
  it.each(["/library", "/review"])(
    "redirects a confirmed guest before rendering %s",
    async (fullPath) => {
      await guard({ fullPath });
      expect(session.load).toHaveBeenCalledOnce();
      expect(navigate).toHaveBeenCalledWith(
        { path: "/login", query: { redirect: fullPath } },
        { replace: true },
      );
    },
  );
  it("keeps identity failures retryable instead of treating them as logout", async () => {
    session.state.value.status = "failed";
    await guard({ fullPath: "/review" });
    expect(navigate).not.toHaveBeenCalled();
  });
  it("allows a learner and routes an administrator to the admin area", async () => {
    session.actor.value.kind = "account";
    await guard({ fullPath: "/library" });
    expect(navigate).not.toHaveBeenCalled();
    session.isAdmin.value = true;
    await guard({ fullPath: "/library" });
    expect(navigate).toHaveBeenCalledWith("/admin");
  });
  it("uses only the existing safe return target and drops untrusted redirect parameters", async () => {
    await guard({ fullPath: "/review?redirect=https://outside.example" });
    expect(navigate).toHaveBeenCalledWith(
      { path: "/login", query: { redirect: "/review" } },
      { replace: true },
    );
  });
});
