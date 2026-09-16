export default defineNuxtRouteMiddleware(async () => {
  const session = useSessionStore();
  await session.load();
  if (session.isAdmin.value) return navigateTo("/admin/models");
  // Visitors remain on the target. The page boundary owns loading/error/gate.
});
