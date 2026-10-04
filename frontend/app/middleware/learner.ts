export default defineNuxtRouteMiddleware(async () => {
  const session = useSessionStore();
  await session.load();
  if (session.isAdmin.value) return navigateTo("/admin");
  // Visitors remain on the target. The page boundary owns loading/error/gate.
});
