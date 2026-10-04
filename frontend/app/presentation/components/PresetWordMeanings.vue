<script setup lang="ts">
import type { MeaningLanguage } from "@application/shared/models";
defineProps<{
  targets: readonly { entry: string; entryMeaning: string }[];
  meaningLanguage?: MeaningLanguage | undefined;
}>();
const { copy } = useDesignCopy();
// Match the published sample's native language label in word-meanings.js.
const languageNames: Record<MeaningLanguage, string> = {
  zh: "中文",
  en: "English",
  ja: "日本語",
};
</script>
<template>
  <section class="preset-meanings" :aria-label="copy('preset.meanings')">
    <div class="preset-meanings-head">
      <h3><AppIcon name="book-open-text" />{{ copy("preset.meanings") }}</h3>
      <span v-if="meaningLanguage">{{ languageNames[meaningLanguage] }}</span>
    </div>
    <dl v-if="targets.length">
      <div v-for="target in targets" :key="target.entry">
        <dt lang="en">{{ target.entry }}</dt>
        <dd>{{ target.entryMeaning }}</dd>
      </div>
    </dl>
    <p v-else class="muted">{{ copy("preset.meanings.pending") }}</p>
  </section>
</template>
