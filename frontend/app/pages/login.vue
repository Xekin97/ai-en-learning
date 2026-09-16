<script setup lang="ts">
import {
  safeReturnIntent,
  authenticationDestination,
} from "@application/auth/return-intent";

definePageMeta({ middleware: "guest" });
const route = useRoute();
const session = useSessionStore();
const localeController = useApplicationLocale();
const username = ref("");
const password = ref("");
const pending = ref(false);
const hasClaim = computed(
  () => route.query.claim === "1" && session.hasVisitorClaim(),
);
const { t } = useI18n();
const continueHint = computed(() =>
  returnIntent.value
    ? String(t(`auth.continue.${returnIntent.value.target}`))
    : "",
);
const returnIntent = computed(() => safeReturnIntent(route.query.redirect));
const registerTo = computed(() => ({
  path: "/register",
  query: {
    ...(hasClaim.value ? { claim: "1" } : {}),
    ...(returnIntent.value ? { redirect: returnIntent.value.href } : {}),
  },
}));

useLocalizedHead("common.login");

async function submit() {
  pending.value = true;
  try {
    await session.login({
      username: username.value,
      password: password.value,
      locale: localeController.locale.value as "zh-CN" | "en-US",
    });
    await localeController.initialize();
    if (session.isAdmin.value) {
      await navigateTo("/admin/models");
      return;
    }
    if (hasClaim.value) {
      const batchId = await session.consumeVisitorClaim();
      await navigateTo(`/library/${encodeURIComponent(batchId)}`);
      return;
    }
    await navigateTo(
      authenticationDestination(session.isAdmin.value, returnIntent.value),
    );
  } catch {
    // The store exposes a localized-safe failure model.
  } finally {
    pending.value = false;
  }
}
</script>

<template>
  <section class="container auth-layout">
    <div class="auth-message">
      <p class="eyebrow">
        {{ hasClaim ? $t("auth.claimEyebrow") : $t("auth.storyEyebrow") }}
      </p>
      <h1>{{ hasClaim ? $t("auth.claimTitle") : $t("auth.loginStory") }}</h1>
      <p class="page-description">
        {{ hasClaim ? $t("auth.claimCopy") : $t("auth.storyCopy") }}
      </p>
    </div>
    <div class="auth-card">
      <p v-if="!hasClaim && continueHint" class="auth-intent" role="status">
        {{ continueHint }}
      </p>
      <div v-if="hasClaim" class="notice notice-warning">
        <AppIcon name="alert" />
        <div>
          <strong class="notice-title">{{ $t("auth.claimNotice") }}</strong
          >{{ $t("auth.claimLogin") }}
        </div>
      </div>
      <hr v-if="hasClaim" class="divider" />
      <h2>{{ $t("auth.welcome") }}</h2>
      <p class="card-subtitle">{{ $t("auth.loginCopy") }}</p>
      <AppError :failure="session.state.value.failure" />
      <form :aria-label="$t('auth.loginSubmit')" @submit.prevent="submit">
        <label class="field"
          ><span class="field-label">{{ $t("auth.username") }}</span
          ><input
            v-model="username"
            class="text-input"
            autocomplete="username"
            required
            minlength="3"
            maxlength="32"
          /><span class="helper">{{ $t("auth.usernameHelper") }}</span></label
        >
        <label class="field"
          ><span class="field-label">{{ $t("auth.password") }}</span
          ><input
            v-model="password"
            class="text-input"
            type="password"
            autocomplete="current-password"
            required
            minlength="8"
            maxlength="128"
          /><span class="helper">{{ $t("auth.passwordHelper") }}</span></label
        >
        <button
          class="button button-primary auth-submit"
          :disabled="pending"
          type="submit"
        >
          {{ pending ? $t("common.loading") : $t("auth.loginSubmit") }}
        </button>
      </form>
      <p class="auth-alt">
        {{ $t("auth.newHere") }}
        <NuxtLink class="button button-quiet button-small" :to="registerTo">{{
          $t("auth.goRegister")
        }}</NuxtLink>
      </p>
    </div>
  </section>
</template>
