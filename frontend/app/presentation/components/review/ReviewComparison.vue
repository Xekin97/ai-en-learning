<script setup lang="ts">
import type { AnswerComparison } from "@application/review/models";
defineProps<{ answer: AnswerComparison }>();
const { copy } = useDesignCopy();
</script>
<template>
  <span v-if="answer.result === 'correct'" class="result-word good"
    >{{ answer.correct }}<small>{{ copy("correct") }}</small></span
  ><span v-else class="result-word"
    ><s class="bad">{{ answer.input || copy("unanswered") }}</s
    ><strong class="good">{{ answer.correct }}</strong
    ><small>{{
      copy(answer.result === "unanswered" ? "unanswered" : "incorrect")
    }}</small></span
  >
</template>
