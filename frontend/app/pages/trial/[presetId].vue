<script setup lang="ts">
const route = useRoute();
useLocalizedHead("common.create");
</script>
<template>
  <GenerationWorkspace
    :key="String(route.params.presetId)"
    :preset-id="String(route.params.presetId)"
  />
</template>
