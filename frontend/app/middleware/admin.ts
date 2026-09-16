export default defineNuxtRouteMiddleware(async () => {
  const session = useSessionStore();
  await session.load();
  if (!session.isAdmin.value) return navigateTo("/");
});
