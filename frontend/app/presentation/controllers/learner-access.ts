import { safeReturnIntent } from "@application/auth/return-intent";
import { presentAuthGate } from "@presentation/auth/auth-gate-presenter";

export function useLearnerAccess() {
  const app = useNuxtApp();
  const session = useSessionStore(),
    route = useRoute(),
    router = useRouter();
  const { t } = useI18n();
  let loader: (() => Promise<void>) | null = null;
  let mounted = false;
  const view = computed(() => {
    if (session.state.value.status === "failed")
      return { kind: "failed" as const, failure: session.state.value.failure };
    if (session.state.value.status !== "ready")
      return { kind: "pending" as const };
    if (session.isLearner.value) return { kind: "learner" as const };
    const intent = safeReturnIntent(route.fullPath);
    if (session.actor.value?.kind === "visitor" && intent)
      return {
        kind: "guest" as const,
        gate: presentAuthGate(intent, (key, params) =>
          String(t(key, params ?? {})),
        ),
      };
    return { kind: "pending" as const };
  });
  async function initialize(load: () => Promise<void>) {
    loader = load;
    await session.load();
    if (session.isAdmin.value) {
      await router.replace("/admin/models");
      return;
    }
    if (session.isLearner.value) await app.runWithContext(load);
  }
  async function retry() {
    await session.load(true);
    if (session.isLearner.value) await app.runWithContext(() => loader?.());
  }
  onMounted(() => {
    mounted = true;
  });
  watch(session.epoch, async () => {
    if (!mounted) return;
    await nextTick();
    if (session.isAdmin.value) await router.replace("/admin/models");
    else if (session.isLearner.value)
      await app.runWithContext(() => loader?.());
  });
  return { view, initialize, retry, isLearner: session.isLearner };
}
