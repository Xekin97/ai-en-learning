<script setup lang="ts">
import { useLearnerAccess } from "@presentation/controllers/learner-access";
definePageMeta({ middleware: "learner" });
const access = useLearnerAccess(),
  account = useAccountStore(),
  session = useSessionStore(),
  feedback = useFeedbackStore();
const { copy } = useDesignCopy();
const nickname = ref(""),
  gender = ref<"female" | "male" | "">("");
const passwordOpen = ref(false),
  deleteOpen = ref(false),
  deleteFinal = ref(false);
const currentPassword = ref(""),
  newPassword = ref(""),
  confirmation = ref(""),
  deletePassword = ref(""),
  deleteConfirmed = ref(false);
await access.initialize(async () => {
  await usePageLoader("account", () => account.load());
  nickname.value = account.state.value.account?.nickname ?? "";
  gender.value = account.state.value.account?.gender ?? "";
});
useHead({ title: () => copy("profile.title") });
const busy = computed(() => account.state.value.status === "saving");
function closePassword() {
  passwordOpen.value = false;
  currentPassword.value = "";
  newPassword.value = "";
  confirmation.value = "";
  account.clearPasswordFailure();
}
function closeDelete() {
  deleteOpen.value = false;
  deleteFinal.value = false;
  deletePassword.value = "";
  deleteConfirmed.value = false;
}
async function save() {
  try {
    await account.saveProfile({
      nickname: nickname.value.trim() || null,
      gender: gender.value || null,
    });
    feedback.show("saved");
  } catch {
    feedback.show("failed");
  }
}
async function savePassword() {
  try {
    await account.changePassword(
      currentPassword.value,
      newPassword.value,
      confirmation.value,
    );
    closePassword();
    feedback.show("i.password.saved");
  } catch {
    feedback.show("failed");
  }
}
async function remove() {
  try {
    await account.deleteAccount(deletePassword.value, true);
    closeDelete();
    await navigateTo("/");
    feedback.show("i.deleted");
  } catch {
    deleteFinal.value = false;
    feedback.show("failed");
  }
}
async function logout() {
  await session.logout();
  await navigateTo("/");
}
</script>
<template>
  <LearnerPageBoundary :view="access.view.value" @retry="access.retry"
    ><AccountShell :account="account.state.value.account"
      ><div class="page-head">
        <div>
          <h1>{{ copy("profile.title") }}</h1>
          <p>{{ copy("profile.desc") }}</p>
        </div>
      </div>
      <AppError :failure="account.state.value.failure" />
      <div class="profile-sections">
        <section class="panel profile-form-panel">
          <div class="account-section-head">
            <AppIcon name="user" />
            <h2>{{ copy("account.details") }}</h2>
          </div>
          <form @submit.prevent="save">
            <div class="form-grid">
              <label class="field"
                ><span>{{ copy("nickname") }}</span
                ><input
                  v-model="nickname"
                  autocomplete="nickname"
                  aria-describedby="nickname-hint" /></label
              ><label class="field"
                ><span>{{ copy("gender") }}</span
                ><AppSelect v-model="gender">
                  <option value="">{{ copy("unspecified") }}</option>
                  <option value="female">{{ copy("female") }}</option>
                  <option value="male">{{ copy("male") }}</option>
                </AppSelect></label
              >
            </div>
            <div class="profile-save-row">
              <p id="nickname-hint" class="field-help">
                {{ copy("account.nickname.hint") }}
              </p>
              <button class="btn primary" type="submit" :disabled="busy">
                <AppIcon name="save" />{{ copy("save") }}
              </button>
            </div>
          </form>
        </section>
        <section class="panel profile-security">
          <div class="account-section-head">
            <AppIcon name="lock-keyhole" />
            <h2>{{ copy("account.security") }}</h2>
          </div>
          <div class="security-row">
            <span class="security-icon" aria-hidden="true"
              ><AppIcon name="lock-keyhole"
            /></span>
            <div>
              <h3>{{ copy("password") }}</h3>
              <p>{{ copy("account.password.hint") }}</p>
            </div>
            <button class="btn" type="button" @click="passwordOpen = true">
              {{ copy("password") }}
            </button>
          </div>
          <div class="security-row">
            <span class="security-icon" aria-hidden="true"
              ><AppIcon name="log-out"
            /></span>
            <div>
              <h3>{{ copy("logout") }}</h3>
              <p>{{ copy("account.logout.hint") }}</p>
            </div>
            <button class="btn" type="button" @click="logout">
              {{ copy("logout") }}
            </button>
          </div>
          <div class="security-row security-delete">
            <span class="security-icon" aria-hidden="true"
              ><AppIcon name="trash"
            /></span>
            <div>
              <h3>{{ copy("deleteaccount") }}</h3>
              <p>{{ copy("deleteaccount.desc") }}</p>
            </div>
            <button
              class="btn danger quiet"
              type="button"
              @click="deleteOpen = true"
            >
              {{ copy("deleteaccount") }}
            </button>
          </div>
        </section>
      </div></AccountShell
    >
    <AppDialog
      id="change-password"
      :open="passwordOpen"
      :title="copy('password')"
      @close="closePassword"
      ><AppError :failure="account.state.value.passwordFailure" />
      <form id="password-form" @submit.prevent="savePassword">
        <label class="field"
          ><span>{{ copy("i.current") }}</span
          ><input
            v-model="currentPassword"
            type="password"
            autocomplete="current-password"
            required /></label
        ><label class="field"
          ><span>{{ copy("newpassword") }}</span
          ><input
            v-model="newPassword"
            type="password"
            autocomplete="new-password"
            required
            minlength="8"
            maxlength="128" /></label
        ><label class="field"
          ><span>{{ copy("i.confirm") }}</span
          ><input
            v-model="confirmation"
            type="password"
            autocomplete="new-password"
            required
            minlength="8"
            maxlength="128"
        /></label>
        <p class="notice">{{ copy("i.sessions") }}</p>
      </form>
      <template #footer
        ><button class="btn" type="button" @click="closePassword">
          {{ copy("cancel") }}</button
        ><button
          class="btn primary"
          form="password-form"
          type="submit"
          :disabled="busy || newPassword !== confirmation"
        >
          {{ copy("save") }}
        </button></template
      ></AppDialog
    >
    <AppDialog
      id="delete-account"
      :open="deleteOpen"
      :title="copy('deleteaccount')"
      @close="closeDelete"
      ><AppError :failure="account.state.value.failure" /><template
        v-if="!deleteFinal"
        ><form id="delete-form" @submit.prevent="deleteFinal = true">
          <p class="notice warn">{{ copy("deleteaccount.desc") }}</p>
          <label class="field"
            ><span>{{ copy("i.current") }}</span
            ><input
              v-model="deletePassword"
              type="password"
              autocomplete="current-password"
              required /></label
          ><label class="library-check"
            ><input
              v-model="deleteConfirmed"
              type="checkbox"
              required
            /><span>{{ copy("i.delete.confirm") }}</span></label
          >
        </form></template
      >
      <p v-else class="notice warn">{{ copy("i.delete.final") }}</p>
      <template #footer
        ><button class="btn" type="button" @click="closeDelete">
          {{ copy("cancel") }}</button
        ><button
          v-if="!deleteFinal"
          class="btn danger"
          type="submit"
          form="delete-form"
        >
          {{ copy("confirm") }}</button
        ><button
          v-else
          class="btn danger"
          type="button"
          :disabled="busy"
          @click="remove"
        >
          {{ copy("deleteaccount") }}
        </button></template
      ></AppDialog
    >
  </LearnerPageBoundary>
</template>
