<script setup lang="ts">
type VocabularyItem = {
  entry: string;
  meaning: string;
  usage: string;
};

const props = withDefaults(
  defineProps<{
    items: readonly VocabularyItem[];
    variant: "plan" | "result";
    heading?: string | undefined;
    languageLabel?: string | undefined;
    ariaLabel?: string | undefined;
    reduced?: boolean;
    pronunciationEnabled?: boolean;
    pronunciationSurface?: string | undefined;
    pronunciationActive?: boolean;
  }>(),
  {
    heading: undefined,
    languageLabel: undefined,
    ariaLabel: undefined,
    pronunciationSurface: undefined,
    pronunciationActive: true,
  },
);

const initialEntries =
  props.variant === "plan" && !props.reduced
    ? props.items.map((item) => item.entry)
    : [];
const enteringEntries = ref<ReadonlySet<string>>(new Set(initialEntries));
const entryTimers = new Map<string, ReturnType<typeof setTimeout>>();

function scheduleEntryCleanup(entry: string) {
  const existing = entryTimers.get(entry);
  if (existing) clearTimeout(existing);
  entryTimers.set(
    entry,
    setTimeout(() => {
      const next = new Set(enteringEntries.value);
      next.delete(entry);
      enteringEntries.value = next;
      entryTimers.delete(entry);
    }, 180),
  );
}

onMounted(() => {
  initialEntries.forEach(scheduleEntryCleanup);
});

watch(
  () => props.items.map((item) => item.entry),
  (entries, previous) => {
    const current = new Set(entries);
    for (const [entry, timer] of entryTimers) {
      if (current.has(entry)) continue;
      clearTimeout(timer);
      entryTimers.delete(entry);
    }
    if (props.reduced || previous.length === 0) return;
    const prior = new Set(previous);
    const added = entries.filter((entry) => !prior.has(entry));
    if (!added.length) return;
    enteringEntries.value = new Set([...enteringEntries.value, ...added]);
    added.forEach(scheduleEntryCleanup);
  },
);

watch(
  () => props.reduced,
  (value) => {
    if (!value) return;
    entryTimers.forEach((timer) => clearTimeout(timer));
    entryTimers.clear();
    enteringEntries.value = new Set();
  },
);

onBeforeUnmount(() => {
  entryTimers.forEach((timer) => clearTimeout(timer));
  entryTimers.clear();
});
</script>

<template>
  <section
    class="preset-meanings m003-vocabulary-panel"
    :class="
      props.variant === 'plan' ? 'm003-plan-meanings' : 'm003-result-meanings'
    "
    :aria-label="props.ariaLabel || props.heading"
  >
    <div
      v-if="props.heading || props.languageLabel"
      class="preset-meanings-head section-head"
    >
      <h3 v-if="props.heading">
        <AppIcon name="book-open-text" />{{ props.heading }}
      </h3>
      <span v-if="props.languageLabel">{{ props.languageLabel }}</span>
    </div>
    <dl class="m003-vocabulary-list">
      <div
        v-for="item in props.items"
        :key="item.entry"
        class="plan-item"
        :class="{ 'is-entering': enteringEntries.has(item.entry) }"
        :data-plan-kind="props.variant === 'plan' ? 'word_use' : undefined"
        :data-plan-entry="props.variant === 'plan' ? item.entry : undefined"
      >
        <div class="pron-word-heading">
          <dt lang="en">{{ item.entry }}</dt>
          <WordPronunciation
            v-if="props.pronunciationEnabled && props.pronunciationSurface"
            :entry="item.entry"
            :surface-id="props.pronunciationSurface"
            :active="props.pronunciationActive"
          />
        </div>
        <dd>{{ item.meaning }}</dd>
        <dd class="muted" lang="en">{{ item.usage }}</dd>
      </div>
    </dl>
  </section>
</template>
