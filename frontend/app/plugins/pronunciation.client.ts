import {
  createBrowserPronunciationClock,
  PronunciationCoordinator,
} from "@application/pronunciation/coordinator";
import { createNativeBrowserSpeech } from "@infrastructure/pronunciation/browser-speech";

export default defineNuxtPlugin((nuxtApp) => {
  const coordinator = new PronunciationCoordinator(
    createNativeBrowserSpeech(),
    createBrowserPronunciationClock(),
  );
  coordinator.start();

  const removeRouteGuard = nuxtApp.$router.beforeEach(() => {
    coordinator.cancelAll();
  });
  const dispose = () => {
    removeRouteGuard();
    coordinator.dispose();
  };
  window.addEventListener("beforeunload", dispose, { once: true });
  import.meta.hot?.dispose(dispose);

  return { provide: { pronunciation: coordinator } };
});
