<script setup lang="ts">
import type { UiLocale } from "@application/shared/models";

const localeController = useApplicationLocale();
const { copy } = useDesignCopy();

async function onChange(event: Event) {
  await localeController.change(
    (event.target as HTMLSelectElement).value as UiLocale,
  );
}
</script>

<template>
  <label class="locale-control">
    <span class="sr-only">{{ copy("language") }}</span>
    <AppSelect
      :value="localeController.locale.value"
      :aria-label="copy('language')"
      @change="onChange"
    >
      <option value="zh-CN">中文</option>
      <option value="en-US">EN</option>
    </AppSelect>
  </label>
</template>
