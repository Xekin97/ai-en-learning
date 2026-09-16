import type { RangeVisit } from "@application/review/range-setup";
import { presentReviewSetup } from "@presentation/review/review-setup-presenter";
import { useLearnerAccess } from "./learner-access";

export function useReviewSetupController() {
  const app = useNuxtApp();
  const session = useSessionStore();
  const access = useLearnerAccess();
  const store = useReviewSetupStore();
  const router = useRouter();
  const { t } = useI18n();
  const editor = ref<{ focusStart: () => void } | null>(null);
  let owner: RangeVisit | null = null;
  let mounted = false;
  let browserVisit: RangeVisit | null = null;
  function ensureVisit() {
    if (!owner || !store.current(owner)) owner = store.enter();
    return owner;
  }
  function release() {
    if (owner) store.dispose(owner);
    owner = null;
    browserVisit = null;
  }
  // Register synchronously: Nuxt may suspend this setup while loading SSR data.
  onScopeDispose(release);
  watch(session.epoch, release, { flush: "sync" });
  async function initializeBrowser(force = false) {
    if (!session.isLearner.value || !mounted) return;
    const lease = ensureVisit();
    if (!force && browserVisit === lease) return;
    browserVisit = lease;
    let timezone: string | null = null;
    try {
      timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
    } catch {
      /* explicit unavailable state */
    }
    if (store.initializeBrowser(lease, new Date(), timezone))
      await store.preview(lease);
  }
  onMounted(() => {
    mounted = true;
    void initializeBrowser();
  });
  async function load() {
    const lease = ensureVisit();
    // Called on SSR/navigation, but callOnce suppresses the hydration duplicate.
    await usePageLoader("review-setup:" + session.epoch.value, () =>
      store.loadResume(lease),
    );
    if (mounted) await initializeBrowser();
  }
  async function initialize() {
    await access.initialize(load);
  }
  async function retryPreview(source: HTMLElement) {
    if (source.ownerDocument.activeElement === source)
      editor.value?.focusStart();
    await initializeBrowser(true);
  }
  async function start() {
    if (!owner) return;
    const lease = owner;
    const sessionId = await store.start(lease);
    if (sessionId && store.current(lease))
      await router.push("/review/" + encodeURIComponent(sessionId));
  }
  async function resume() {
    if (!owner) return;
    const sessionId = store.resumeTarget(owner);
    if (sessionId)
      await router.push("/review/" + encodeURIComponent(sessionId));
  }
  async function retryResume() {
    if (owner)
      await app.runWithContext(() =>
        owner ? store.loadResume(owner) : Promise.resolve(),
      );
  }
  return {
    access,
    editor,
    initialize,
    retryPreview,
    retryResume,
    start,
    resume,
    changeStart: (value: string) => {
      if (owner) store.changeDate(owner, "startDate", value);
    },
    changeEnd: (value: string) => {
      if (owner) store.changeDate(owner, "endDate", value);
    },
    view: computed(() =>
      presentReviewSetup(
        store.state.value,
        access.isLearner.value,
        (key, params) => String(t(key, params ?? {})),
      ),
    ),
  };
}
