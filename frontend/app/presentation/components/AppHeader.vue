<script setup lang="ts">
const session = useSessionStore();
const route = useRoute();
const { locale } = useI18n();
const menuOpen = ref(false);

async function signOut() {
  await session.logout();
  await navigateTo("/");
}

function current(path: string) {
  return route.path === path ||
    (path !== "/" && route.path.startsWith(`${path}/`))
    ? "page"
    : undefined;
}

const brandLocaleClass = computed(() =>
  locale.value === "zh-CN" ? "brand-name-zh" : "brand-name-en",
);

const identityInitial = computed(() => {
  const actor = session.actor.value;
  return actor?.kind === "account"
    ? actor.username.charAt(0).toUpperCase()
    : "";
});
</script>

<template>
  <header class="app-header">
    <div class="container app-header-inner">
      <NuxtLink to="/" class="brand" :aria-label="$t('brand')">
        <BrandMark />
        <span class="brand-copy">
          <span class="brand-name" :class="brandLocaleClass">{{
            $t("brand")
          }}</span>
        </span>
      </NuxtLink>
      <nav class="main-nav" :aria-label="$t('common.mainNavigation')">
        <NuxtLink
          class="nav-link"
          to="/create"
          :aria-current="current('/create')"
          >{{ $t("common.create") }}</NuxtLink
        >
        <NuxtLink
          class="nav-link"
          to="/review"
          :aria-current="current('/review')"
          >{{ $t("common.review") }}</NuxtLink
        >
        <NuxtLink
          class="nav-link"
          to="/library"
          :aria-current="current('/library')"
          >{{ $t("common.library") }}</NuxtLink
        >
      </nav>
      <div class="header-actions">
        <LocaleSwitch />
        <template v-if="session.actor.value?.kind === 'account'">
          <NuxtLink
            v-if="session.isAdmin.value"
            class="button button-quiet button-small"
            to="/admin/models"
            >{{ $t("admin.title") }}</NuxtLink
          >
          <NuxtLink v-else class="identity-pill" to="/account">
            <span class="identity-avatar" aria-hidden="true">{{
              identityInitial
            }}</span>
            <span>{{ session.actor.value.username }}</span>
          </NuxtLink>
        </template>
        <template v-else>
          <NuxtLink class="button button-quiet button-small" to="/login">{{
            $t("common.login")
          }}</NuxtLink>
          <NuxtLink class="button button-primary button-small" to="/register">{{
            $t("common.register")
          }}</NuxtLink>
        </template>
      </div>
      <button
        class="mobile-nav-toggle"
        type="button"
        :aria-expanded="menuOpen"
        :aria-label="
          menuOpen ? $t('common.closeNavigation') : $t('common.openNavigation')
        "
        @click="menuOpen = !menuOpen"
      >
        <AppIcon name="menu" />
      </button>
    </div>
    <div v-if="menuOpen" class="container mobile-menu-list">
      <NuxtLink
        class="button button-quiet"
        to="/create"
        @click="menuOpen = false"
        >{{ $t("common.create") }}</NuxtLink
      >
      <NuxtLink
        class="button button-quiet"
        to="/review"
        @click="menuOpen = false"
        >{{ $t("common.review") }}</NuxtLink
      >
      <NuxtLink
        class="button button-quiet"
        to="/library"
        @click="menuOpen = false"
        >{{ $t("common.library") }}</NuxtLink
      >
      <NuxtLink
        v-if="session.isLearner.value"
        class="button button-quiet"
        to="/account"
        @click="menuOpen = false"
        >{{ $t("common.account") }}</NuxtLink
      >
      <template v-if="session.actor.value?.kind !== 'account'">
        <NuxtLink
          class="button button-quiet"
          to="/login"
          @click="menuOpen = false"
          >{{ $t("common.login") }}</NuxtLink
        >
        <NuxtLink
          class="button button-primary"
          to="/register"
          @click="menuOpen = false"
          >{{ $t("common.register") }}</NuxtLink
        >
      </template>
      <button v-else class="button button-quiet" type="button" @click="signOut">
        {{ $t("common.logout") }}
      </button>
    </div>
  </header>
</template>
