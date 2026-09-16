import type { AppFailure, UiLocale } from "@application/shared/models";
import { normalizeFailure } from "@application/shared/failure";

const STORAGE_KEY = "wordweave.uiLocale";

export function useApplicationLocale() {
  const nuxtApp = useNuxtApp();
  const locale = computed(() => nuxtApp.$i18n.locale.value as UiLocale);
  const session = useSessionStore();
  const failure = useState<AppFailure | null>("locale-failure", () => null);
  const preferenceCookie = useCookie<UiLocale | undefined>(
    "wordweave_ui_locale",
    {
      sameSite: "lax",
      maxAge: 31_536_000,
    },
  );

  async function initialize(): Promise<void> {
    const accountLocale = session.state.value.snapshot?.accountLocale;
    const preferred =
      accountLocale ?? preferenceCookie.value ?? requestPreference() ?? "en-US";
    await apply(preferred, false);
  }

  async function change(next: UiLocale): Promise<void> {
    await apply(next, true);
  }

  async function apply(next: UiLocale, persistAccount: boolean): Promise<void> {
    await nuxtApp.$i18n.setLocale(next);
    preferenceCookie.value = next;
    if (import.meta.client) localStorage.setItem(STORAGE_KEY, next);
    failure.value = null;
    if (!persistAccount || session.actor.value?.kind !== "account") return;
    try {
      await session.refreshSecurityContext();
      await nuxtApp.$api.updateLocale(next);
    } catch (error) {
      failure.value = normalizeFailure(error);
    }
  }

  function requestPreference(): UiLocale | null {
    if (import.meta.client)
      return navigator.language.toLowerCase().startsWith("zh")
        ? "zh-CN"
        : "en-US";
    const language = useRequestHeaders(["accept-language"])["accept-language"];
    return language?.toLowerCase().includes("zh") ? "zh-CN" : "en-US";
  }

  return {
    locale,
    failure: readonly(failure),
    initialize,
    change,
  };
}
