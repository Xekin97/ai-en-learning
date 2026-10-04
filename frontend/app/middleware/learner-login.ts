import { safeReturnIntent } from "@application/auth/return-intent";

export default defineNuxtRouteMiddleware(async (to) => {
  const session = useSessionStore();
  await session.load();
  if (session.isAdmin.value) return navigateTo("/admin");
  // A failed identity request must remain retryable, not become a guest redirect.
  if (
    session.state.value.status === "ready" &&
    session.actor.value?.kind === "visitor"
  ) {
    const intent = safeReturnIntent(to.fullPath);
    if (intent)
      return navigateTo(
        { path: "/login", query: { redirect: intent.href } },
        { replace: true },
      );
  }
});
