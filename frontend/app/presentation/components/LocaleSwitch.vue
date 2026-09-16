<script setup lang="ts">
import type { UiLocale } from "@application/shared/models";

defineProps<{ dark?: boolean }>();
const localeController = useApplicationLocale();

async function onChange(event: Event) {
  await localeController.change(
    (event.target as HTMLSelectElement).value as UiLocale,
  );
}
</script>

<template>
  <label class="locale-switch" :class="{ 'locale-switch-dark': dark }">
    <span class="sr-only">{{ $t("common.language") }}</span>
    <span class="locale-symbol" aria-hidden="true"
      ><AppIcon name="globe"
    /></span>
    <select
      :value="localeController.locale.value"
      :aria-label="$t('common.language')"
      @change="onChange"
    >
      <option value="zh-CN">中文</option>
      <option value="en-US">EN</option>
    </select>
  </label>
</template>
