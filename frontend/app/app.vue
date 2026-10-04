<script setup lang="ts">
const session = useSessionStore();
await session.load();
const account = useAccountStore();
if (session.isLearner.value) await account.load();
const localeController = useApplicationLocale();
await localeController.initialize();
const nuxtApp = useNuxtApp();

onMounted(() => {
  document.documentElement.dataset.appReady = "true";
});

useHead({
  titleTemplate: (title) =>
    title
      ? `${title} · ${nuxtApp.$i18n.t("brand")}`
      : String(nuxtApp.$i18n.t("brand")),
  htmlAttrs: { lang: () => String(localeController.locale.value) },
});
</script>

<template>
  <NuxtLayout><NuxtPage /></NuxtLayout
  ><ClientOnly><ToastHost /><NoticeHost /></ClientOnly>
</template>
