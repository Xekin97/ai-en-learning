<script setup lang="ts">
import { useReviewSetupController } from "@presentation/controllers/review-setup";
definePageMeta({ middleware: "learner-login" });
const setup = useReviewSetupController();
const { editor } = setup;
const { copy } = useDesignCopy();
useLocalizedHead("common.review");
await setup.initialize();
</script>

<template>
  <div>
    <LearnerPageBoundary
      :view="setup.access.view.value"
      @retry="setup.access.retry"
    >
      <ReviewRangeSetup
        ref="editor"
        :view="setup.view.value"
        @change-start="setup.changeStart"
        @change-end="setup.changeEnd"
        @retry="setup.retryPreview"
        @retry-resume="setup.retryResume"
        @start="setup.start"
        @resume="setup.resume"
        @recent="setup.recent"
      />
      <AppDialog
        id="replace-range"
        :open="setup.replacementOpen.value"
        :title="copy('l.replace.title')"
        @close="setup.cancelReplacement"
        ><p>{{ copy("l.replace.desc") }}</p>
        <template #footer
          ><button class="btn" @click="setup.cancelReplacement">
            {{ copy("cancel") }}</button
          ><button class="btn primary" @click="setup.confirmReplacement">
            {{ copy("l.begin") }}
          </button></template
        ></AppDialog
      >
    </LearnerPageBoundary>
  </div>
</template>
