export default defineNuxtRouteMiddleware(async () => {
  const session = useSessionStore();
  await session.load();
  if (session.actor.value?.kind === "account") {
    return navigateTo(session.isAdmin.value ? "/admin/models" : "/library");
  }
});
