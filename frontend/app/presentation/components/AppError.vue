<script setup lang="ts">
import type { AppFailure } from "@application/shared/models";

defineProps<{ failure: AppFailure | null }>();
const { t, te } = useI18n();
</script>

<template>
  <div v-if="failure" class="notice error app-error" role="alert">
    <AppIcon name="alert" />
    <div>
      {{
        te(`error.${failure.kind}`)
          ? t(`error.${failure.kind}`)
          : t("error.unknown")
      }}
    </div>
  </div>
</template>
