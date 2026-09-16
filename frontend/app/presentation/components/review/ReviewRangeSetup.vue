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
}>();
const startInput = ref<HTMLInputElement | null>(null);
defineExpose({ focusStart: () => startInput.value?.focus() });
function change(event: Event, field: "start" | "end") {
  if (!(event.target instanceof HTMLInputElement)) return;
  if (field === "start") emit("changeStart", event.target.value);
  else emit("changeEnd", event.target.value);
}
function retry(event: MouseEvent) {
  if (event.currentTarget instanceof HTMLElement)
    emit("retry", event.currentTarget);
}
</script>

<template>
  <header class="page-heading">
    <div>
      <p class="eyebrow">{{ view.eyebrow }}</p>
      <h1 class="page-title">{{ view.title }}</h1>
      <p class="page-description">{{ view.description }}</p>
    </div>
  </header>
  <section v-if="view.resume" class="notice notice-info range-resume">
    <AppIcon name="clock" />
    <div>
      <strong class="notice-title">{{ view.resume.title }}</strong>
      <p>{{ view.resume.copy }}</p>
      <div class="inline-actions">
        <button
          class="button button-secondary button-small"
          type="button"
          @click="emit('resume')"
        >
          {{ view.resume.action }}
        </button>
      </div>
    </div>
  </section>
  <section v-if="view.resumeFailure" class="review-resume-error">
    <AppError :failure="view.resumeFailure" />
    <button
      class="button button-secondary button-small"
      type="button"
      @click="emit('retryResume')"
    >
      {{ view.retry }}
    </button>
  </section>
  <AppError :failure="view.createFailure" />
  <section class="review-setup range-editor" :data-range-preview="view.status">
    <form class="card" novalidate @submit.prevent="emit('start')">
      <div class="card-header">
        <div>
          <h2 class="card-title">{{ view.rangeTitle }}</h2>
          <p class="card-subtitle">{{ view.rangeCopy }}</p>
        </div>
      </div>
      <div class="card-body">
        <div class="date-range">
          <div class="field">
            <label for="review-start" class="field-label">{{ view.from }}</label
            ><input
              id="review-start"
              ref="startInput"
              class="text-input date-input"
              type="date"
              required
              :value="view.startDate"
              :aria-invalid="view.startInvalid"
              :aria-describedby="
                view.startInvalid ? 'range-date-error' : undefined
              "
              @input="change($event, 'start')"
            />
          </div>
          <div class="field">
            <label for="review-end" class="field-label">{{ view.to }}</label
            ><input
              id="review-end"
              class="text-input date-input"
              type="date"
              required
              :value="view.endDate"
              :aria-invalid="view.endInvalid"
              :aria-describedby="
                view.endInvalid ? 'range-date-error' : undefined
              "
              @input="change($event, 'end')"
            />
          </div>
        </div>
        <p
          id="range-date-error"
          class="range-field-error"
          :hidden="!view.fieldError"
        >
          {{ view.fieldError }}
        </p>
      </div>
      <div class="card-footer">
        <button
          class="button button-primary"
          type="submit"
          :disabled="!view.canStart"
        >
          {{ view.start }} <AppIcon name="arrow" />
        </button>
      </div>
    </form>
    <aside class="count-card range-count" :aria-busy="view.loading">
      <span class="count-number" :aria-hidden="!view.countKnown || undefined">{{
        view.count
      }}</span
      ><strong v-if="view.countKnown">{{ view.stories }}</strong>
      <p class="helper">{{ view.countHint }}</p>
    </aside>
  </section>
  <p
    id="range-announcement"
    class="sr-only"
    role="status"
    aria-live="polite"
    aria-atomic="true"
  >
    {{ view.announcement }}
  </p>
  <div class="range-feedback">
    <section v-if="view.empty" class="empty-state card">
      <span class="empty-symbol" aria-hidden="true"
        ><AppIcon name="book"
      /></span>
      <h2>{{ view.emptyTitle }}</h2>
      <p>{{ view.emptyCopy }}</p>
      <div class="inline-actions">
        <NuxtLink class="button button-secondary" to="/library">{{
          view.library
        }}</NuxtLink
        ><NuxtLink class="button button-primary" to="/create">{{
          view.create
        }}</NuxtLink>
      </div>
    </section>
    <section v-else-if="view.failed" class="notice notice-danger">
      <AppIcon name="alert" />
      <div>
        <strong class="notice-title">{{ view.errorTitle }}</strong>
        <p>{{ view.errorCopy }}</p>
        <button
          class="button button-secondary button-small"
          type="button"
          @click="retry"
        >
          {{ view.retry }}
        </button>
      </div>
    </section>
  </div>
</template>
