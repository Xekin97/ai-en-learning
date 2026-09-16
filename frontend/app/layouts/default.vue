<template>
  <div>
    <a class="skip-link" href="#main-content">{{
      $t("common.skipToContent")
    }}</a>
    <AppHeader />
    <main id="main-content" class="page-main" tabindex="-1">
      <slot />
    </main>
  </div>
</template>
