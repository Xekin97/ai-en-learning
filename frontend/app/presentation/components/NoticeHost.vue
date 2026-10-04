<script setup lang="ts">
import { authenticationFeedbackFor } from "@runtime/session/authentication-feedback";
const events = authenticationFeedbackFor(useNuxtApp());
const notices = useNoticesStore();
const { copy, language } = useDesignCopy();
const format = useDisplayFormatters();
watch(
  events.reminders,
  (value) => {
    if (value > 0) void notices.load(false, true);
  },
  { immediate: true },
);
watch(language, () => {
  if (notices.state.value.open) {
    if (notices.state.value.reminders) void notices.load(false, true, true);
    else if (notices.selected.value)
      void notices.open(notices.selected.value.id);
  }
});
</script>
<template>
  <NoticeReadingDialog
    id="platform-notice"
    :open="notices.state.value.open"
    :title="notices.selected.value?.title ?? copy('notices.title')"
    :body-key="notices.selected.value?.id"
    :meta="
      notices.selected.value
        ? `${format.calendarDate(notices.selected.value.publishedAt)} · ${copy('position', { index: notices.state.value.index + 1, total: notices.state.value.dialog.length })}`
        : undefined
    "
    @close="notices.close"
    @shown="notices.markDisplayed"
    ><template v-if="notices.selected.value">
      <SafeNoticeBody :notice="notices.selected.value" /> </template
    ><AppError :failure="notices.state.value.failure" /><template #footer
      ><template v-if="notices.state.value.dialog.length"
        ><button
          class="btn"
          type="button"
          :disabled="notices.state.value.index === 0"
          @click="notices.move(-1)"
        >
          {{ copy("previous") }}</button
        ><button
          class="btn"
          type="button"
          :disabled="
            notices.state.value.index === notices.state.value.dialog.length - 1
          "
          @click="notices.move(1)"
        >
          {{ copy("next") }}
        </button></template
      ><button class="btn primary" type="button" @click="notices.close">
        {{ copy("close") }}
      </button></template
    ></NoticeReadingDialog
  >
</template>
