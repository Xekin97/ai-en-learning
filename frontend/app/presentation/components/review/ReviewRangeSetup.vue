<script setup lang="ts">
import type { ReviewSetupViewModel } from "@presentation/review/review-setup-presenter";
defineProps<{ view: ReviewSetupViewModel }>();
const emit = defineEmits<{
  changeStart: [value: string];
  changeEnd: [value: string];
  retry: [source: HTMLElement];
  retryResume: [];
  start: [];
  resume: [];
  recent: [];
}>();
const startInput = ref<HTMLInputElement>(),
  { copy } = useDesignCopy();
defineExpose({ focusStart: () => startInput.value?.focus() });
</script>
<template>
  <div class="page-head">
    <div>
      <h1>{{ copy("l.range") }}</h1>
      <p>{{ copy("l.range.desc") }}</p>
    </div>
    <NuxtLink class="btn" to="/library">{{ copy("l.backLibrary") }}</NuxtLink>
  </div>
  <section v-if="view.resume" class="notice range-resume">
    <div>
      <strong>{{ copy("l.unfinished") }}</strong>
      <p>{{ view.resume.copy }}</p>
    </div>
    <button class="btn primary" @click="emit('resume')">
      {{ copy("l.continueRange") }}
    </button>
  </section>
  <AppError :failure="view.resumeFailure || view.createFailure" /><button
    v-if="view.resumeFailure"
    class="btn"
    @click="emit('retryResume')"
  >
    {{ copy("retry") }}
  </button>
  <div class="range-editor" :data-range-preview="view.status">
    <form class="panel" novalidate @submit.prevent="emit('start')">
      <h2>{{ copy("l.dates") }}</h2>
      <p class="muted">{{ copy("l.dates.desc") }}</p>
      <div class="date-fields">
        <label class="field"
          ><span>{{ copy("l.from") }}</span
          ><input
            ref="startInput"
            type="date"
            :value="view.startDate"
            required
            :aria-invalid="view.startInvalid"
            aria-describedby="range-error"
            @input="
              emit('changeStart', ($event.target as HTMLInputElement).value)
            " /></label
        ><label class="field"
          ><span>{{ copy("l.to") }}</span
          ><input
            type="date"
            :value="view.endDate"
            required
            :aria-invalid="view.endInvalid"
            aria-describedby="range-error"
            @input="
              emit('changeEnd', ($event.target as HTMLInputElement).value)
            "
        /></label>
      </div>
      <p id="range-error" class="bad" role="alert">
        {{ view.fieldError ? copy("l.dateerror") : "" }}
      </p>
      <div class="actions">
        <button class="btn" type="button" @click="emit('recent')">
          {{ copy("l.recent") }}</button
        ><button class="btn primary" type="submit" :disabled="!view.canStart">
          {{ copy("l.begin") }}
        </button>
      </div>
    </form>
    <aside class="range-count panel" aria-live="polite">
      <strong>{{ view.count }}</strong
      ><span>{{ copy("l.matches") }}</span>
    </aside>
  </div>
  <div id="range-feedback">
    <p v-if="view.loading" role="status">{{ copy("loading") }}</p>
    <template v-else-if="view.failed"
      ><p class="note error">{{ copy("l.preview.error") }}</p>
      <button
        class="btn"
        @click="emit('retry', $event.currentTarget as HTMLElement)"
      >
        {{ copy("retry") }}
      </button></template
    >
    <div v-else-if="view.empty" class="empty">
      <h2>{{ copy("l.nomatch") }}</h2>
      <p>{{ copy("l.nomatch.desc") }}</p>
      <NuxtLink class="btn" to="/library">{{ copy("l.backLibrary") }}</NuxtLink
      ><NuxtLink class="btn primary" to="/create">{{
        copy("create")
      }}</NuxtLink>
    </div>
  </div>
</template>
