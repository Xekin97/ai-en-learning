import { authenticationFeedbackFor } from "@runtime/session/authentication-feedback";
import type {
  AppFailure,
  SessionSnapshot,
  UiLocale,
} from "@application/shared/models";
import { normalizeFailure } from "@application/shared/failure";

import { resetPrivateStates } from "@runtime/session/private-state";

interface SessionState {
  snapshot: SessionSnapshot | null;
  status: "idle" | "loading" | "ready" | "failed";
  failure: AppFailure | null;
}

export function useSessionStore() {
  const app = useNuxtApp();
  const authFeedback = authenticationFeedbackFor(app);
  const epoch = useState("session-epoch", () => 0);
  const revision = useState("session-request-revision", () => 0);
  const state = useState<SessionState>("session", () => ({
    snapshot: null,
    status: "idle",
    failure: null,
  }));
  const api = useNuxtApp().$api;

  async function load(force = false): Promise<void> {
    if (
      !force &&
      (state.value.status === "ready" || state.value.status === "loading")
    )
      return;
    const request = ++revision.value;
    if (!state.value.snapshot) state.value.status = "loading";
    try {
      const snapshot = await api.bootstrap();
      if (request !== revision.value) return;
      setSnapshot(snapshot);
      state.value.failure = null;
      state.value.status = "ready";
    } catch (error) {
      if (request !== revision.value) return;
      state.value.failure = normalizeFailure(error);
      state.value.status = "failed";
    }
  }

  async function refreshSecurityContext(): Promise<void> {
    if (import.meta.server) return;
    await load(true);
    if (state.value.status !== "ready") throw state.value.failure;
  }

  async function login(input: {
    username: string;
    password: string;
    locale: UiLocale;
  }): Promise<void> {
    try {
      await refreshSecurityContext();
      const snapshot = await api.login({
        username: input.username,
        password: input.password,
        browserUiLocale: input.locale,
      });
      revision.value++;
      setSnapshot(snapshot, true);
      authFeedback.queue(snapshot, "login");
      state.value.status = "ready";
      state.value.failure = null;
    } catch (error) {
      state.value.failure = normalizeFailure(error);
      throw state.value.failure;
    }
  }

  async function register(input: {
    username: string;
    password: string;
    confirmation: string;
    locale: UiLocale;
  }): Promise<void> {
    try {
      await refreshSecurityContext();
      const snapshot = await api.register({
        username: input.username,
        password: input.password,
        passwordConfirmation: input.confirmation,
        uiLocale: input.locale,
      });
      revision.value++;
      setSnapshot(snapshot, true);
      authFeedback.queue(snapshot, "register");
      state.value.status = "ready";
      state.value.failure = null;
    } catch (error) {
      state.value.failure = normalizeFailure(error);
      throw state.value.failure;
    }
  }

  function setSnapshot(snapshot: SessionSnapshot, force = false) {
    const previous = state.value.snapshot?.actor;
    if (
      force ||
      previous?.kind !== snapshot.actor.kind ||
      (previous?.kind === "account" ? previous.id : null) !==
        (snapshot.actor.kind === "account" ? snapshot.actor.id : null) ||
      previous?.role !== snapshot.actor.role
    ) {
      epoch.value++;
      resetPrivateStates(app);
      authFeedback.clear();
    }
    state.value.snapshot = {
      actor: snapshot.actor,
      accountLocale: snapshot.accountLocale,
      supportedLocales: snapshot.supportedLocales,
    };
  }

  function invalidate() {
    revision.value++;
    setSnapshot(
      {
        actor: { kind: "visitor", username: null, role: null, planCode: null },
        accountLocale: null,
        supportedLocales: ["zh-CN", "en-US"],
      },
      true,
    );
    state.value.status = "ready";
    state.value.failure = null;
  }

  async function logout(): Promise<void> {
    await refreshSecurityContext();
    await api.logout();
    invalidate();
  }

  async function consumeVisitorClaim(): Promise<string> {
    await refreshSecurityContext();
    try {
      const result = await api.consumeVisitorClaim();
      state.value.failure = null;
      return result.batchId;
    } catch (error) {
      state.value.failure = normalizeFailure(error);
      throw state.value.failure;
    }
  }

  return {
    state: readonly(state),
    epoch: readonly(epoch),
    invalidate,
    hasVisitorClaim: () => api.hasVisitorClaim(),
    actor: computed(() => state.value.snapshot?.actor ?? null),
    isLearner: computed(
      () =>
        state.value.snapshot?.actor.kind === "account" &&
        state.value.snapshot.actor.role === "learner",
    ),
    isAdmin: computed(
      () =>
        state.value.snapshot?.actor.kind === "account" &&
        state.value.snapshot.actor.role === "admin",
    ),
    load,
    refreshSecurityContext,
    login,
    register,
    logout,
    consumeVisitorClaim,
    presentAuthenticationFeedback: authFeedback.present,
  };
}
