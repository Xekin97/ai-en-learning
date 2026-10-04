<script setup lang="ts">
import type { AchievementKind } from "@application/growth/models";
definePageMeta({ middleware: "learner" });
const growth = useGrowthStore(),
  { copy } = useDesignCopy(),
  session = useSessionStore();
const value = computed(() => growth.state.value.growth),
  kinds: AchievementKind[] = [
    "checkin_streak",
    "review_streak",
    "mastered_words",
    "saved_passages",
  ];
const groups = computed(() =>
  kinds.map((kind) => {
    const items = growth.state.value.achievements.filter(
      (a) => a.kind === kind,
    );
    const featured = items.find((a) => a.state !== "claimed") ?? items[0];
    return {
      kind,
      featured,
      other: items.filter((a) => a !== featured),
      count: items.length,
    };
  }),
);
const percent = computed(() => {
  const v = value.value;
  if (!v) return 0;
  if (!v.nextLevel) return 100;
  const total =
    BigInt(v.nextLevel.minExperience) - BigInt(v.level.minExperience);
  const completed = BigInt(v.experience) - BigInt(v.level.minExperience);
  return total > 0n
    ? Math.max(0, Math.min(100, Number((completed * 10000n) / total) / 100))
    : 0;
});
if (session.isLearner.value) await usePageLoader("growth", () => growth.load());
const { locale } = useI18n();
watch(locale, () => void growth.load());
const rewards = ref<HTMLElement>();
async function claimReward(
  kind: "achievement" | "level",
  id: string,
  group?: AchievementKind,
) {
  if (growth.state.value.claiming) return;
  await growth.claim(kind, id);
  if (growth.state.value.failure) return;
  await nextTick();
  const target =
    kind === "achievement"
      ? rewards.value?.querySelector<HTMLElement>(
          `[data-achievement-group="${group}"] summary`,
        )
      : [
          ...(rewards.value?.querySelectorAll<HTMLElement>("[data-level-id]") ??
            []),
        ]
          .find((row) => row.dataset.levelId === id)
          ?.querySelector<HTMLElement>("h3");
  if (target) {
    if (kind === "level") target.tabIndex = -1;
    target.focus({ preventScroll: true });
  }
}
</script>
<template>
  <AccountPage
    ><div class="page-head">
      <div>
        <h1>{{ copy("growth.title") }}</h1>
        <p>{{ copy("growth.desc") }}</p>
      </div>
    </div>
    <AppError :failure="growth.state.value.failure" /><button
      v-if="growth.state.value.failure"
      class="btn"
      @click="growth.load"
    >
      {{ copy("retry") }}
    </button>
    <p v-if="growth.state.value.pending && !value">{{ copy("loading") }}</p>
    <div v-if="value" ref="rewards" class="account-growth">
      <div class="growth-grid">
        <section class="growth-banner">
          <div class="growth-level-heading">
            <div>
              <p class="eyebrow">{{ copy("level") }}</p>
              <h2>Lv. {{ value.level.number }}</h2>
            </div>
            <span class="growth-level-symbol" aria-hidden="true"
              ><AppIcon name="trophy"
            /></span>
          </div>
          <p class="growth-xp">
            {{
              value.nextLevel
                ? copy("progress", {
                    current: value.experience,
                    target: value.nextLevel.minExperience,
                  })
                : `${copy("maxlevel")} · ${value.experience} XP`
            }}
          </p>
          <div
            class="progress"
            role="progressbar"
            :aria-label="copy('level')"
            :aria-valuemin="0"
            :aria-valuemax="100"
            :aria-valuenow="Math.round(percent)"
          >
            <span :style="{ width: percent + '%' }" />
          </div>
          <div class="stats">
            <div>
              <strong>{{ value.points }}</strong
              ><small>{{ copy("points") }}</small>
            </div>
            <div>
              <strong>{{ value.masteredTotal }}</strong
              ><small>{{ copy("mastered") }}</small>
            </div>
            <div>
              <strong>{{ value.savedTotal }}</strong
              ><small>{{ copy("stories") }}</small>
            </div>
          </div>
        </section>
        <section class="panel signin-panel">
          <div class="section-head">
            <h2><AppIcon name="calendar-check" />{{ copy("signin") }}</h2>
            <span class="pill">{{
              copy(value.checkin.signedToday ? "signed" : "unsigned")
            }}</span>
          </div>
          <div class="calendar">
            <span
              v-for="day in growth.state.value.calendar?.days"
              :key="day.day"
              class="day"
              :class="{
                signed: day.state === 'normal' || day.state === 'makeup',
                today: day.day === value.learningDay,
                missed: day.state === 'missing',
              }"
              ><time :datetime="day.day">{{ Number(day.day.slice(-2)) }}</time
              ><AppIcon
                :name="
                  day.state === 'normal' || day.state === 'makeup'
                    ? 'check'
                    : day.day === value.learningDay
                      ? 'circle'
                      : 'minus'
                "
              /><span class="sr-only">{{
                copy(
                  day.state === "normal" || day.state === "makeup"
                    ? "signed"
                    : "unsigned",
                )
              }}</span></span
            >
          </div>
          <p class="signin-rule">{{ copy("signin.rule") }}</p>
          <div class="actions">
            <NuxtLink class="btn" to="/account/items">{{
              copy("makeup")
            }}</NuxtLink
            ><NuxtLink class="btn primary" to="/create">{{
              copy("learn")
            }}</NuxtLink>
          </div>
        </section>
      </div>
      <section class="section">
        <div class="account-section-head">
          <AppIcon name="trophy" />
          <h2>{{ copy("achievements") }}</h2>
        </div>
        <div class="achievement-grid">
          <template v-for="group in groups" :key="group.kind"
            ><div
              v-if="group.featured"
              class="achievement-group"
              :data-achievement-group="group.kind"
            >
              <AchievementCard
                :achievement="group.featured"
                :pending="!!growth.state.value.claiming"
                @claim="claimReward('achievement', $event, group.kind)"
              />
              <details class="tier-disclosure">
                <summary>{{ copy("g.tiers", { count: group.count }) }}</summary>
                <div>
                  <AchievementCard
                    v-for="item in group.other"
                    :key="item.id"
                    :achievement="item"
                    :pending="!!growth.state.value.claiming"
                    @claim="claimReward('achievement', $event, group.kind)"
                  />
                </div>
              </details></div
          ></template>
        </div>
      </section>
      <section class="section">
        <div class="account-section-head">
          <AppIcon name="gift" />
          <h2>{{ copy("levelrewards") }}</h2>
        </div>
        <div class="level-reward-list">
          <article
            v-for="award in growth.state.value.levels"
            :key="award.id"
            class="level-reward"
            :data-level-id="award.levelId"
          >
            <span class="level-reward-symbol" aria-hidden="true"
              ><AppIcon name="gift"
            /></span>
            <h3>Lv. {{ award.levelNumber }}</h3>
            <div class="level-reward-details">
              <p class="growth-reward">
                {{
                  copy("reward", {
                    points: award.reward.points,
                    xp: award.reward.experience,
                  })
                }}<template v-if="award.reward.item"
                  ><br />{{ award.reward.item.name }} ×
                  {{ award.reward.item.count }}</template
                >
              </p>
              <p v-if="award.state === 'blocked'" class="note warn">
                {{
                  copy(
                    award.blockReason === "tier_disabled"
                      ? "reward.disabled"
                      : award.blockReason === "level_required"
                        ? "reward.demoted"
                        : "reward.blocked",
                  )
                }}
              </p>
            </div>
            <button
              class="btn primary"
              :disabled="
                !!growth.state.value.claiming || award.state !== 'claimable'
              "
              @click="claimReward('level', award.levelId)"
            >
              {{
                copy(
                  award.state === "claimed"
                    ? "claimed"
                    : award.achievedAt
                      ? "claimlevel"
                      : "unreached",
                )
              }}
            </button>
          </article>
        </div>
      </section>
    </div></AccountPage
  >
</template>
