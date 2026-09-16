<script setup lang="ts">
import type { useLearnerAccess } from "@presentation/controllers/learner-access";
defineProps<{ view: ReturnType<typeof useLearnerAccess>["view"]["value"] }>();
defineEmits<{ retry: [] }>();
</script>
<template>
  <slot v-if="view.kind === 'learner'" />
  <AuthGate v-else-if="view.kind === 'guest'" :view="view.gate" />
  <section v-else-if="view.kind === 'failed'" class="card empty-state">
    <AppError :failure="view.failure" />
    <button class="button button-secondary" @click="$emit('retry')">
      {{ $t("common.retry") }}
    </button>
  </section>
  <div v-else role="status" aria-busy="true">{{ $t("common.loading") }}</div>
</template>
