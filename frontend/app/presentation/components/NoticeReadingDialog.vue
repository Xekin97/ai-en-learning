<script setup lang="ts">
defineProps<{
  id: string;
  open: boolean;
  title: string;
  meta?: string | undefined;
  bodyKey?: string | undefined;
}>();
const emit = defineEmits<{ close: []; shown: [key: string | undefined] }>();
const { copy } = useDesignCopy();
</script>
<template>
  <AppDialog
    :id="id"
    :open="open"
    :title="title"
    :close-label="copy('close')"
    :body-key="bodyKey"
    notice
    @close="emit('close')"
    @shown="emit('shown', $event)"
  >
    <template #header
      ><header class="notice-heading">
        <p class="eyebrow">
          <AppIcon name="bell" />{{ copy("notices.title") }}
        </p>
        <h2 :id="`${id}-dialog-title`">{{ title }}</h2>
        <p v-if="meta" class="notice-meta">{{ meta }}</p>
      </header></template
    >
    <slot /><template #footer
      ><slot name="footer"
        ><button type="button" class="btn primary" @click="emit('close')">
          {{ copy("close") }}
        </button></slot
      ></template
    >
  </AppDialog>
</template>
