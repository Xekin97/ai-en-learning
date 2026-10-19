<script setup lang="ts">
defineProps<{
  name:
    | "speaker"
    | "preparing"
    | "playing"
    | "error"
    | "gesture"
    | "accent"
    | "chevron"
    | "check";
}>();
</script>
<template>
  <svg
    class="pron-icon"
    viewBox="0 0 24 24"
    aria-hidden="true"
    focusable="false"
  >
    <template v-if="name === 'speaker'">
      <path d="M11 5 6 9H3v6h3l5 4V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7" />
      <path d="M18.5 5.5a9 9 0 0 1 0 13" />
    </template>
    <path v-else-if="name === 'preparing'" d="M20 12a8 8 0 1 1-5.5-7.6" />
    <path
      v-else-if="name === 'playing'"
      d="M4 10v4M8 6v12M12 3v18M16 7v10M20 10v4"
    />
    <template v-else-if="name === 'error' || name === 'gesture'">
      <path d="M3 10a9 9 0 1 1 2.6 8.4" />
      <path d="M3 4v6h6" />
    </template>
    <template v-else-if="name === 'accent'">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6M12 17h.01" />
    </template>
    <path v-else-if="name === 'chevron'" d="m7 10 5 5 5-5" />
    <path v-else d="m5 12 4 4L19 6" />
  </svg>
</template>
