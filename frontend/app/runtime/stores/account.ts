import { reviewDrafts } from "@infrastructure/storage/review-drafts";
import { normalizeFailure } from "@application/shared/failure";
import type { AccountModel, AppFailure } from "@application/shared/models";

interface AccountState {
  account: AccountModel | null;
  status: "idle" | "loading" | "ready" | "saving" | "failed";
  failure: AppFailure | null;
  passwordFailure: AppFailure | null;
  notice: "password_saved" | null;
}

export function useAccountStore() {
  const api = useNuxtApp().$api;
  const session = useSessionStore(),
    feedback = useFeedbackStore();
  const state = usePrivateState<AccountState>("account", () => ({
    account: null,
    status: "idle",
    failure: null,
    passwordFailure: null,
    notice: null,
  }));

  async function load(force = false): Promise<void> {
    if (!force && state.value.status === "ready") return;
    const epoch = session.epoch.value;
    state.value.status = "loading";
    try {
      const account = await api.getAccount();
      if (epoch !== session.epoch.value) return;
      state.value.account = account;
      state.value.failure = null;
      state.value.status = "ready";
    } catch (error) {
      if (epoch !== session.epoch.value) return;
      state.value.failure = normalizeFailure(error);
      if (state.value.failure.kind === "authentication_required")
        session.invalidate();
      state.value.status = "failed";
    }
  }

  async function saveProfile(input: {
    nickname: string | null;
    gender: "female" | "male" | null;
  }) {
    const epoch = session.epoch.value;
    state.value.status = "saving";
    state.value.failure = null;
    try {
      await session.refreshSecurityContext();
      if (epoch !== session.epoch.value) return;
      const account = await api.updateAccount(input);
      if (epoch !== session.epoch.value) return;
      state.value.account = account;
      state.value.status = "ready";
    } catch (error) {
      if (epoch !== session.epoch.value) return;
      state.value.failure = normalizeFailure(error);
      state.value.status = "failed";
      throw state.value.failure;
    }
  }

  async function changePassword(
    currentPassword: string,
    newPassword: string,
    confirmation: string,
  ): Promise<void> {
    const epoch = session.epoch.value;
    state.value.status = "saving";
    state.value.notice = null;
    state.value.passwordFailure = null;
    try {
      await session.refreshSecurityContext();
      if (epoch !== session.epoch.value) return;
      await api.changePassword({ currentPassword, newPassword, confirmation });
      if (epoch !== session.epoch.value) return;
      state.value.notice = "password_saved";
      state.value.passwordFailure = null;
      state.value.status = "ready";
    } catch (error) {
      if (epoch !== session.epoch.value) return;
      state.value.passwordFailure = normalizeFailure(error);
      if (state.value.passwordFailure.kind === "authentication_required")
        session.invalidate();
      state.value.status = "failed";
      throw state.value.passwordFailure;
    }
  }

  function clearPasswordFailure(): void {
    state.value.passwordFailure = null;
  }

  async function deleteAccount(
    currentPassword: string,
    confirmed: true,
  ): Promise<void> {
    const epoch = session.epoch.value;
    state.value.status = "saving";
    try {
      await session.refreshSecurityContext();
      if (epoch !== session.epoch.value) return;
      const accountId =
        session.actor.value?.kind === "account" ? session.actor.value.id : null;
      await api.deleteAccount({ currentPassword, confirmed });
      if (accountId && import.meta.client) {
        try {
          await reviewDrafts.clearAccount(accountId);
        } catch {
          feedback.show("failed");
        }
      }
      if (epoch !== session.epoch.value) return;
      await session.load(true);
    } catch (error) {
      if (epoch !== session.epoch.value) return;
      state.value.failure = normalizeFailure(error);
      if (state.value.failure.kind === "authentication_required")
        session.invalidate();
      state.value.status = "failed";
      throw state.value.failure;
    }
  }

  return {
    state: readonly(state),
    load,
    saveProfile,
    changePassword,
    clearPasswordFailure,
    deleteAccount,
  };
}
