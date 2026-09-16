<script setup lang="ts">
import { useLearnerAccess } from "@presentation/controllers/learner-access";
const access = useLearnerAccess();
definePageMeta({ middleware: "learner" });
const account = useAccountStore();
const session = useSessionStore();
const format = useDisplayFormatters();
const passwordOpen = ref(false);
const passwordTrigger = ref<HTMLButtonElement | null>(null);
const deleteOpen = ref(false);
const currentPassword = ref("");
const newPassword = ref("");
const confirmation = ref("");
const deletePassword = ref("");
const deleteConfirmed = ref(false);

await access.initialize(async () => {
  await usePageLoader("account", () => account.load());
});
useLocalizedHead("account.title");

function closePassword() {
  passwordOpen.value = false;
  account.clearPasswordFailure();
  currentPassword.value = "";
  newPassword.value = "";
  confirmation.value = "";
  void nextTick(() => passwordTrigger.value?.focus({ preventScroll: true }));
}

function openPassword() {
  account.clearPasswordFailure();
  passwordOpen.value = true;
}

function closeDelete() {
  deleteOpen.value = false;
  deletePassword.value = "";
  deleteConfirmed.value = false;
}

async function savePassword() {
  try {
    await account.changePassword(
      currentPassword.value,
      newPassword.value,
      confirmation.value,
    );
    closePassword();
  } catch {
    // Failure is rendered from the account store.
  }
}

async function removeAccount() {
  if (!deletePassword.value || !deleteConfirmed.value) return;
  try {
    await account.deleteAccount(deletePassword.value, deleteConfirmed.value);
    closeDelete();
    await navigateTo("/");
  } catch {
    deleteConfirmed.value = false;
  }
}

async function signOut() {
  await session.logout();
  await navigateTo("/");
}
</script>

<template>
  <section class="container page-section">
    <LearnerPageBoundary :view="access.view.value" @retry="access.retry">
      <header class="page-heading">
        <div>
          <p class="eyebrow">{{ $t("account.eyebrow") }}</p>
          <h1 class="page-title">{{ $t("account.title") }}</h1>
        </div>
      </header>
      <div
        v-if="account.state.value.notice === 'password_saved'"
        class="notice notice-success account-notice"
      >
        <AppIcon name="check" />
        <div>
          <strong class="notice-title">{{ $t("account.passwordSaved") }}</strong
          >{{ $t("account.passwordSavedCopy") }}
        </div>
      </div>
      <AppError :failure="account.state.value.failure" />
      <div class="settings-grid">
        <section class="card">
          <header class="card-header">
            <h2 class="card-title">{{ $t("account.profile") }}</h2>
          </header>
          <dl
            v-if="account.state.value.account"
            class="card-body definition-list"
          >
            <div>
              <dt>{{ $t("auth.username") }}</dt>
              <dd>{{ account.state.value.account.username }}</dd>
            </div>
            <div>
              <dt>{{ $t("account.plan") }}</dt>
              <dd>{{ format.group(account.state.value.account.planCode) }}</dd>
            </div>
            <div>
              <dt>{{ $t("account.loginMethod") }}</dt>
              <dd>{{ $t("account.usernamePassword") }}</dd>
            </div>
          </dl>
          <footer class="card-footer">
            <button
              ref="passwordTrigger"
              class="button button-secondary"
              type="button"
              @click="openPassword"
            >
              {{ $t("account.password") }}</button
            ><button class="button button-quiet" type="button" @click="signOut">
              <AppIcon name="logout" />{{ $t("common.logout") }}
            </button>
          </footer>
        </section>
        <section class="card danger-zone">
          <header class="card-header">
            <div>
              <h2 class="card-title">{{ $t("account.danger") }}</h2>
              <p class="card-subtitle">{{ $t("account.dangerShort") }}</p>
            </div>
          </header>
          <div class="card-body">
            <p>{{ $t("account.dangerCopy") }}</p>
            <button
              class="button button-danger"
              type="button"
              @click="deleteOpen = true"
            >
              {{ $t("account.deleteAccount") }}
            </button>
          </div>
        </section>
      </div>

      <AppDialog
        id="change-password"
        :open="passwordOpen"
        :title="$t('account.password')"
        @close="closePassword"
      >
        <form
          id="change-password-form"
          class="dialog-form"
          @submit.prevent="savePassword"
        >
          <AppError :failure="account.state.value.passwordFailure" />
          <label class="field"
            ><span class="field-label">{{ $t("auth.currentPassword") }}</span
            ><input
              v-model="currentPassword"
              class="text-input"
              type="password"
              autocomplete="current-password"
              required
            /><span class="helper">{{
              $t("account.confirmPasswordCopy")
            }}</span></label
          >
          <label class="field"
            ><span class="field-label">{{ $t("auth.newPassword") }}</span
            ><input
              v-model="newPassword"
              class="text-input"
              type="password"
              autocomplete="new-password"
              required
              minlength="8"
            /><span class="helper">{{
              $t("account.newPasswordCopy")
            }}</span></label
          >
          <label class="field"
            ><span class="field-label">{{
              $t("account.confirmNewPassword")
            }}</span
            ><input
              v-model="confirmation"
              class="text-input"
              type="password"
              autocomplete="new-password"
              required
              minlength="8"
            /><span class="helper">{{
              $t("auth.confirmationHelper")
            }}</span></label
          >
          <div class="notice">
            <AppIcon name="info" />
            <div>{{ $t("account.otherSessions") }}</div>
          </div>
        </form>
        <template #footer
          ><button
            class="button button-secondary"
            type="button"
            @click="closePassword"
          >
            {{ $t("common.cancel") }}</button
          ><button
            class="button button-primary"
            type="submit"
            form="change-password-form"
            :disabled="
              !currentPassword || !newPassword || newPassword !== confirmation
            "
          >
            {{ $t("account.confirmChange") }}
          </button></template
        >
      </AppDialog>

      <AppDialog
        id="delete-account"
        :open="deleteOpen"
        :title="$t('account.deleteDialog')"
        @close="closeDelete"
      >
        <form
          id="delete-account-form"
          class="dialog-form"
          @submit.prevent="removeAccount"
        >
          <div class="notice notice-danger">
            <AppIcon name="alert" />
            <div>
              <strong class="notice-title">{{
                $t("account.deleteWarning")
              }}</strong
              >{{ $t("account.deleteImmediate") }}
            </div>
          </div>
          <label class="field"
            ><span class="field-label">{{ $t("auth.currentPassword") }}</span
            ><input
              v-model="deletePassword"
              class="text-input"
              type="password"
              autocomplete="current-password"
              required
            /><span class="helper">{{
              $t("account.confirmPasswordCopy")
            }}</span></label
          >
          <label class="checkbox-row"
            ><input v-model="deleteConfirmed" type="checkbox" /><span
              ><strong>{{ $t("account.deleteConfirmation") }}</strong></span
            ></label
          >
        </form>
        <template #footer
          ><button
            class="button button-secondary"
            type="button"
            @click="closeDelete"
          >
            {{ $t("account.keepAccount") }}</button
          ><button
            class="button button-danger"
            type="submit"
            form="delete-account-form"
            :disabled="
              !deletePassword ||
              !deleteConfirmed ||
              account.state.value.status === 'saving'
            "
          >
            {{ $t("account.deleteAccount") }}
          </button></template
        >
      </AppDialog>
    </LearnerPageBoundary>
  </section>
</template>
