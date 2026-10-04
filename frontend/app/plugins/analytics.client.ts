import { useAnalyticsEvents } from "@runtime/stores/analytics-events";
export default defineNuxtPlugin({
  name: "first-party-analytics",
  enforce: "post",
  setup(app) {
    const router = useRouter();
    app.hook("app:mounted", async () => {
      const events = await app.runWithContext(() => useAnalyticsEvents());
      events.visit(router.currentRoute.value.path);
      router.afterEach((to, from, failure) => {
        if (!failure && to.path !== from.path) events.visit(to.path);
      });
    });
  },
});
