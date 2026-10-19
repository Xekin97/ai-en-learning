<script setup lang="ts">
import type { ConfigPortabilityCategory } from "@application/admin/config-portability";

defineProps<{
  category: ConfigPortabilityCategory;
  refresh?: (() => Promise<void>) | undefined;
}>();
const store = useConfigPortabilityStore();
const { copy } = useDesignCopy();
</script>

<template>
  <div
    class="cr313-actions"
    role="group"
    :aria-label="copy('portability.actionsLabel')"
  >
    <button class="btn" type="button" @click="store.open(category, 'import')">
      <AppIcon name="arrow" />{{ copy("portability.import") }}
    </button>
    <button class="btn" type="button" @click="store.open(category, 'export')">
      <AppIcon name="save" />{{ copy("portability.export") }}
    </button>
  </div>
  <ClientOnly>
    <ConfigPortabilityDialog :refresh="refresh" />
  </ClientOnly>
</template>
