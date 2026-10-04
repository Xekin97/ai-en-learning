<script setup lang="ts">
const route = useRoute();
const { copy } = useDesignCopy();
</script>
<template>
  <div>
    <a class="skip-link" href="#main-content">{{
      $t("common.skipToContent")
    }}</a
    ><AppHeader />
    <main
      id="main-content"
      class="container"
      :class="{ page: route.path !== '/' }"
      tabindex="-1"
    >
      <slot />
    </main>
    <footer class="container footer">
      <div class="actions">
        <span>{{ copy("footer") }}</span>
      </div>
    </footer>
  </div>
</template>
