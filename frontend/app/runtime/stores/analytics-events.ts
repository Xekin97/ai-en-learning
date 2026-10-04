import type {
  AnalyticsAction,
  AnalyticsEvent,
} from "@application/analytics/models";
import { analyticsPage, analyticsSource } from "@runtime/analytics/events";
interface Events {
  visit: (path: string) => void;
  action: (kind: AnalyticsAction) => void;
}
const services = new WeakMap<object, Events>();
export function useAnalyticsEvents(): Events {
  const app = useNuxtApp(),
    existing = services.get(app);
  if (existing) return existing;
  const api = app.$api,
    session = useSessionStore();
  let path: string | null = null,
    entered = false;
  async function send(event: AnalyticsEvent) {
    if (import.meta.server || session.isAdmin.value) return;
    const epoch = session.epoch.value;
    try {
      try {
        app.$tokenVault.csrf();
      } catch {
        await session.refreshSecurityContext();
      }
      if (epoch !== session.epoch.value || session.isAdmin.value) return;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await api.recordAnalytics(event);
          return;
        } catch {
          if (epoch !== session.epoch.value) return;
        }
      }
    } catch {
      /* Analytics must never interrupt the learning flow. */
    }
  }
  const service: Events = {
    visit(next) {
      if (import.meta.server || path === next) return;
      path = next;
      const page = analyticsPage(next);
      if (!page || session.isAdmin.value) return;
      const source = entered
        ? undefined
        : analyticsSource(window.location.href, document.referrer);
      entered = true;
      void send({
        eventId: crypto.randomUUID(),
        kind: "page_view",
        page,
        ...(source ? { source } : {}),
      });
    },
    action(kind) {
      if (import.meta.server || session.isAdmin.value) return;
      const page = analyticsPage(path ?? window.location.pathname);
      if (page)
        void send({
          eventId: crypto.randomUUID(),
          kind: "key_action",
          page,
          action: kind,
        });
    },
  };
  services.set(app, service);
  return service;
}
