<script setup lang="ts">
import type { AchievementModel } from "@application/growth/models";
import type { DeepReadonly } from "vue";
defineProps<{
  achievement: DeepReadonly<AchievementModel>;
  pending: boolean;
}>();
defineEmits<{ claim: [id: string] }>();
const { copy } = useDesignCopy();
const icons = {
  checkin_streak: "calendar-check",
  review_streak: "clipboard-check",
  mastered_words: "brain",
  saved_passages: "notebook-pen",
} as const;
const reason = {
  tier_disabled: "reward.disabled",
  reward_unavailable: "reward.blocked",
  level_required: "reward.demoted",
};
</script>
<template>
  <article
    class="achievement"
    :class="{ 'is-reached': achievement.achievedAt !== null }"
  >
    <div class="achievement-heading">
      <span class="medal" aria-hidden="true"
        ><AppIcon :name="icons[achievement.kind]"
      /></span>
      <div>
        <h3>{{ achievement.name }}</h3>
        <p class="achievement-count">
          {{ achievement.progress }} / {{ achievement.threshold }}
        </p>
      </div>
    </div>
    <div
      class="progress"
      role="progressbar"
      :aria-label="achievement.name"
      :aria-valuemin="0"
      :aria-valuemax="achievement.threshold"
      :aria-valuenow="Math.min(achievement.progress, achievement.threshold)"
    >
      <span
        :style="{
          width:
            Math.min(
              100,
              (achievement.progress / achievement.threshold) * 100,
            ) + '%',
        }"
      />
    </div>
    <p
      v-if="achievement.descriptionText !== null"
      class="achievement-description"
    >
      {{ achievement.descriptionText }}
    </p>
    <p v-if="achievement.achievedAt" class="achievement-honor">
      <AppIcon name="trophy" />{{
        copy("g.honor", { title: achievement.title })
      }}
    </p>
    <p
      v-if="achievement.state === 'blocked' && achievement.blockReason"
      class="note warn"
    >
      {{ copy(reason[achievement.blockReason]) }}
    </p>
    <div class="achievement-footer">
      <p class="growth-reward">
        {{
          copy("reward", {
            points: achievement.reward.points,
            xp: achievement.reward.experience,
          })
        }}<template v-if="achievement.reward.item"
          ><br />{{ achievement.reward.item.name }} ×
          {{ achievement.reward.item.count }}</template
        >
      </p>
      <button
        class="btn primary"
        :disabled="pending || achievement.state !== 'claimable'"
        @click="$emit('claim', achievement.tierId)"
      >
        {{
          copy(
            achievement.state === "claimed"
              ? "claimed"
              : achievement.achievedAt
                ? "claim"
                : "unreached",
          )
        }}
      </button>
    </div>
  </article>
</template>
