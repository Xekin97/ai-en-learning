<script setup lang="ts">
import { useAnalyticsEvents } from "@runtime/stores/analytics-events";
import {
  safeReturnIntent,
  authenticationDestination,
} from "@application/auth/return-intent";

definePageMeta({ middleware: "guest" });
const route = useRoute();
const session = useSessionStore(),
  analytics = useAnalyticsEvents();
const localeController = useApplicationLocale();
const username = ref("");
const password = ref("");
const confirmation = ref("");
const pending = ref(false);
const authenticated = ref(false);
const claimPending = ref(false);
const hasClaim = computed(
  () => route.query.claim === "1" && session.hasVisitorClaim(),
);
const { t } = useI18n();
const { copy } = useDesignCopy();
const continueHint = computed(() =>
  returnIntent.value
    ? String(t(`auth.continue.${returnIntent.value.target}`))
    : "",
);
const returnIntent = computed(() => safeReturnIntent(route.query.redirect));
const loginTo = computed(() => ({
  path: "/login",
  query: {
    ...(hasClaim.value ? { claim: "1" } : {}),
    ...(returnIntent.value ? { redirect: returnIntent.value.href } : {}),
  },
}));

useLocalizedHead("common.register");

async function submit() {
  pending.value = true;
  analytics.action("submit_registration");
  try {
    await session.register({
      username: username.value,
      password: password.value,
      confirmation: confirmation.value,
      locale: localeController.locale.value as "zh-CN" | "en-US",
    });
    authenticated.value = true;
    await localeController.initialize();
    if (session.isAdmin.value) {
      await navigateTo("/admin");
      return;
    }
    if (hasClaim.value) {
      claimPending.value = true;
      await finishClaim();
      return;
    }
    await navigateTo(
      authenticationDestination(session.isAdmin.value, returnIntent.value),
    );
  } catch {
    // The store exposes a localized-safe failure model.
  } finally {
    password.value = "";
    confirmation.value = "";
    pending.value = false;
    if (authenticated.value && !claimPending.value)
      session.presentAuthenticationFeedback();
  }
}
async function finishClaim() {
  pending.value = true;
  try {
    const batchId = await session.consumeVisitorClaim();
    claimPending.value = false;
    await navigateTo(`/library/${encodeURIComponent(batchId)}`);
    session.presentAuthenticationFeedback();
  } catch {
    /* Retain the same claim for explicit retry. */
  } finally {
    pending.value = false;
  }
}
async function endClaim() {
  claimPending.value = false;
  await navigateTo(
    authenticationDestination(session.isAdmin.value, returnIntent.value),
  );
  session.presentAuthenticationFeedback();
}
</script>
<template>
  <div
    class="auth-layout"
    :class="{ 'has-context': hasClaim || !!returnIntent }"
  >
    <section class="auth-intent">
      <span class="auth-symbol" aria-hidden="true"
        ><AppIcon name="book-open"
      /></span>
      <h2>{{ copy(hasClaim ? "i.claim.title" : "i.story.title") }}</h2>
      <p>{{ copy(hasClaim ? "i.claim.desc" : "i.story.desc") }}</p>
      <p v-if="hasClaim" class="notice">{{ copy("i.claim.note") }}</p>
      <p v-else-if="returnIntent" class="notice">{{ continueHint }}</p>
    </section>
    <section class="auth-form">
      <div class="page-head">
        <div>
          <h1 tabindex="-1">{{ copy("i.register") }}</h1>
          <p>{{ copy("i.register.desc") }}</p>
        </div>
      </div>
      <AppError :failure="session.state.value.failure" />
      <p
        v-if="route.query.claim === '1' && !hasClaim && !authenticated"
        class="notice"
      >
        {{ copy("i.claim.lost") }}
      </p>
      <div v-if="claimPending" class="actions">
        <button class="btn primary" :disabled="pending" @click="finishClaim">
          {{ copy("retry") }}</button
        ><button class="btn" :disabled="pending" @click="endClaim">
          {{ copy("close") }}
        </button>
      </div>
      <form v-else @submit.prevent="submit">
        <label class="field"
          ><span>{{ copy("i.username") }}</span
          ><input
            v-model="username"
            name="username"
            autocomplete="username"
            required
            minlength="3"
            maxlength="32"
            pattern="[A-Za-z0-9_]{3,32}"
        /></label>
        <p class="field-help">{{ copy("i.username.rule") }}</p>
        <label class="field"
          ><span>{{ copy("i.password") }}</span
          ><input
            v-model="password"
            name="password"
            type="password"
            autocomplete="new-password"
            required
            minlength="8"
            maxlength="128"
        /></label>
        <p class="field-help">{{ copy("i.password.rule") }}</p>
        <label class="field"
          ><span>{{ copy("i.confirm") }}</span
          ><input
            v-model="confirmation"
            name="confirmation"
            type="password"
            autocomplete="new-password"
            required
            minlength="8"
            maxlength="128"
        /></label>
        <button
          class="btn primary"
          type="submit"
          :disabled="pending || password !== confirmation"
        >
          {{ copy(pending ? "loading" : "i.register") }}
        </button>
      </form>
      <div v-if="!claimPending" class="auth-switch">
        <span>{{ copy("i.existing") }}</span
        ><NuxtLink class="btn quiet" :to="loginTo">{{
          copy("login")
        }}</NuxtLink>
      </div>
    </section>
  </div>
</template>
