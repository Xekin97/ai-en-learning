<script setup lang="ts">
import { useReviewSetupController } from "@presentation/controllers/review-setup";
const setup = useReviewSetupController();
const { editor } = setup;
useLocalizedHead("common.review");
await setup.initialize();
</script>

<template>
  <div class="container page-section">
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
      />
    </LearnerPageBoundary>
  </div>
</template>
