<script setup lang="ts">
import type { PassageClozeViewModel } from "@presentation/review/passage-cloze-presenter";

defineProps<{ model: PassageClozeViewModel }>();
defineEmits<{
  answerChanged: [blankId: string, value: string];
  blankFocused: [blankId: string];
  blankBlurred: [];
}>();
</script>

<template>
  <div>
    <div :id="model.guideId" class="cloze-group-guide">
      <AppIcon name="info" />
      <span>{{ $t("review.groupGuide") }}</span>
    </div>
    <div class="reading-passage review-cloze-passage">
      <p>
        <template v-for="(segment, index) in model.segments" :key="index">
          <span v-if="segment.kind === 'text'">{{ segment.text }}</span>
          <span
            v-else
            class="cloze-slot"
            :class="[
              segment.toneClass,
              segment.patternClass,
              {
                'is-group-active': segment.active,
                'is-group-muted': segment.muted,
                'is-incorrect': segment.incorrect,
              },
            ]"
          >
            <label class="sr-only" :for="segment.inputId">{{
              $t("review.groupBlank", { group: segment.anonymousGroupName })
            }}</label>
            <input
              :id="segment.inputId"
              class="cloze-input"
              :value="segment.value"
              :aria-describedby="model.guideId"
              :aria-invalid="segment.incorrect || undefined"
              autocomplete="off"
              autocapitalize="none"
              spellcheck="false"
              @input="
                $emit(
                  'answerChanged',
                  segment.blankId,
                  ($event.target as HTMLInputElement).value,
                )
              "
              @focus="$emit('blankFocused', segment.blankId)"
              @blur="$emit('blankBlurred')"
            />
          </span>
        </template>
      </p>
    </div>
  </div>
</template>
