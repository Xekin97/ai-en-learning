<script setup lang="ts">
const session = useSessionStore();
const route = useRoute();
const { locale } = useI18n();

async function signOut() {
  await session.logout();
  await navigateTo("/");
}

function current(path: string) {
  return route.path.startsWith(path) ? "page" : undefined;
}

const brandLocaleClass = computed(() =>
  locale.value === "zh-CN" ? "brand-name-zh" : "brand-name-en",
);
</script>

<template>
  <div class="admin-shell">
    <a class="skip-link" href="#admin-main">{{ $t("common.skipToContent") }}</a>
    <aside class="admin-sidebar">
      <NuxtLink class="brand admin-brand" to="/">
        <BrandMark />
        <span class="brand-copy"
          ><span class="brand-name" :class="brandLocaleClass">{{
            $t("brand")
          }}</span></span
        >
        <span class="admin-badge">{{ $t("admin.badge") }}</span>
      </NuxtLink>
      <span class="admin-label">{{ $t("admin.system") }}</span>
      <nav class="admin-nav" :aria-label="$t('admin.title')">
        <NuxtLink to="/admin/models" :aria-current="current('/admin/models')"
          ><AppIcon name="settings" />{{ $t("admin.models") }}</NuxtLink
        >
        <NuxtLink to="/admin/plans" :aria-current="current('/admin/plans')"
          ><AppIcon name="book" />{{ $t("admin.plans") }}</NuxtLink
        >
        <NuxtLink to="/admin/users" :aria-current="current('/admin/users')"
          ><AppIcon name="users" />{{ $t("admin.users") }}</NuxtLink
        >
      </nav>
      <div class="admin-account">
        <div class="admin-profile">
          <span class="admin-avatar" aria-hidden="true">A</span>
          <span
            ><strong>{{
              session.actor.value?.kind === "account"
                ? session.actor.value.username
                : ""
            }}</strong
            ><small>{{ $t("admin.role") }}</small></span
          >
        </div>
        <div class="admin-account-actions">
          <LocaleSwitch dark />
          <button
            class="admin-logout"
            type="button"
            :aria-label="$t('common.logout')"
            @click="signOut"
          >
            <AppIcon name="logout" /><span>{{ $t("common.logout") }}</span>
          </button>
        </div>
      </div>
    </aside>
    <main id="admin-main" class="admin-main" tabindex="-1">
      <div class="admin-content"><slot /></div>
    </main>
  </div>
</template>
