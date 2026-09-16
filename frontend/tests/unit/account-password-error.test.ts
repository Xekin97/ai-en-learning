import { afterEach, describe, expect, it, vi } from "vitest";
import { readonly, ref, type Ref } from "vue";
import { useAccountStore } from "@runtime/stores/account";
import type { AppFailure } from "@application/shared/models";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept;
    reject = decline;
  });
  return { promise, resolve, reject };
}

const validationFailure: AppFailure = {
  kind: "validation",
  code: "validation_failed",
  status: 422,
  requestId: "req-password-invalid",
  fields: { current_password: "incorrect" },
  retryable: false,
};

const pageFailure: AppFailure = {
  kind: "network",
  code: "network_error",
  status: null,
  requestId: null,
  fields: {},
  retryable: true,
};

function harness(api: object) {
  const state = ref<unknown>();
  vi.stubGlobal("useNuxtApp", () => ({ $api: api }));
  vi.stubGlobal("useSessionStore", () => ({
    epoch: ref(1),
    invalidate: vi.fn(),
    refreshSecurityContext: vi.fn(async () => {}),
  }));
  vi.stubGlobal("usePrivateState", <T>(_key: string, initial: () => T) => {
    const value = ref(initial()) as Ref<T>;
    state.value = value;
    return value;
  });
  vi.stubGlobal("readonly", readonly);
  return { store: useAccountStore(), state };
}

afterEach(() => vi.unstubAllGlobals());

describe("CR037-03 account password failure state", () => {
  it("keeps a normalized password failure separate from the page failure", async () => {
    const { store, state } = harness({
      getAccount: vi.fn(async () => {
        throw pageFailure;
      }),
      changePassword: vi.fn(async () => {
        throw validationFailure;
      }),
    });
    await store.load();
    await expect(
      store.changePassword(
        "WrongPass123!",
        "UpdatedPass123!",
        "UpdatedPass123!",
      ),
    ).rejects.toEqual(validationFailure);
    expect(store.state.value.failure).toEqual(pageFailure);
    expect(store.state.value.passwordFailure).toEqual(validationFailure);
    expect(state.value).toBeDefined();
  });

  it("clears the prior password failure when retry starts and after success", async () => {
    const retry = deferred<undefined>();
    const changePassword = vi
      .fn()
      .mockRejectedValueOnce(validationFailure)
      .mockImplementationOnce(() => retry.promise);
    const { store } = harness({ changePassword });
    await expect(
      store.changePassword(
        "WrongPass123!",
        "UpdatedPass123!",
        "UpdatedPass123!",
      ),
    ).rejects.toEqual(validationFailure);
    const pending = store.changePassword(
      "CorrectPass123!",
      "UpdatedPass123!",
      "UpdatedPass123!",
    );
    expect(store.state.value.passwordFailure).toBeNull();
    retry.resolve(undefined);
    await pending;
    expect(store.state.value.passwordFailure).toBeNull();
    expect(store.state.value.notice).toBe("password_saved");
  });

  it("clears only the password failure when the dialog is cancelled", async () => {
    const { store } = harness({
      getAccount: vi.fn(async () => {
        throw pageFailure;
      }),
      changePassword: vi.fn(async () => {
        throw validationFailure;
      }),
    });
    await store.load();
    await expect(
      store.changePassword(
        "WrongPass123!",
        "UpdatedPass123!",
        "UpdatedPass123!",
      ),
    ).rejects.toEqual(validationFailure);
    store.clearPasswordFailure();
    expect(store.state.value.passwordFailure).toBeNull();
    expect(store.state.value.failure).toEqual(pageFailure);
  });
});
