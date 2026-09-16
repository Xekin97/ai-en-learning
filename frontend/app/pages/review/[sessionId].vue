<script setup lang="ts">
import { useLearnerAccess } from "@presentation/controllers/learner-access";
import { ClozeGroupStyleRegistry } from "@presentation/review/cloze-group-style-registry";
import {
  buildPassageAnswer,
  passageGroupRefs,
  presentPassageCloze,
} from "@presentation/review/passage-cloze-presenter";
import { presentReviewSummary } from "@presentation/review/review-summary-presenter";
const access = useLearnerAccess();

definePageMeta({ middleware: "learner" });
const route = useRoute();
const review = useReviewStore();
const format = useDisplayFormatters();
const { t } = useI18n();
const sessionId = String(route.params.sessionId);
const sourceBatchId =
  typeof route.query.batch === "string" ? route.query.batch : null;
const spellingAnswer = ref("");
const clozeAnswers = ref<Record<string, string>>({});
const activeBlankId = ref<string | null>(null);
const groupRegistry = shallowRef<ClozeGroupStyleRegistry | null>(null);
const showHint = ref(false);
const restartPending = ref(false);
const isSingleBatch = computed(
  () => review.state.value.session?.mode === "single_batch",
);
const returnPath = computed(() =>
  isSingleBatch.value ? "/library" : "/review",
);
const progressPercent = computed(() => {
  const session = review.state.value.session;
  const attempt = review.attempt.value;
  if (!session || session.status !== "active") return 100;
  const total = Math.max(session.progress.totalBatches, 1);
  const itemShare = attempt
    ? (attempt.progress.itemNumber /
        Math.max(attempt.progress.itemsInStage, 1)) *
      0.8
    : 0;
  return Math.min(
    100,
    ((session.progress.completedBatches + itemShare) / total) * 100,
  );
});
const summaryView = computed(() => {
  const current = review.state.value.session;
  return current?.status === "completed"
    ? presentReviewSummary(current, (key, parameters) =>
        String(t(key, parameters ?? {})),
      )
    : null;
});

await access.initialize(async () => {
  await usePageLoader(`review-session:${sessionId}`, () =>
    review.loadSession(sessionId, sourceBatchId),
  );
});
onMounted(() => {
  if (access.isLearner.value) void review.ensureAttempt();
});
onBeforeUnmount(() => {
  groupRegistry.value = null;
});
useLocalizedHead("common.review");

watch(
  () => {
    const attempt = review.attempt.value;
    return attempt ? `${attempt.attemptId}:${attempt.item.itemId}` : null;
  },
  () => {
    spellingAnswer.value = "";
    showHint.value = false;
    clozeAnswers.value = {};
    activeBlankId.value = null;
  },
);

watch(
  () => {
    const attempt = review.attempt.value;
    return attempt?.item.stage === "passage_cloze"
      ? `${attempt.attemptId}:${attempt.item.itemId}`
      : null;
  },
  (itemKey) => {
    const attempt = review.attempt.value;
    if (!itemKey || attempt?.item.stage !== "passage_cloze") {
      groupRegistry.value = null;
      return;
    }
    if (groupRegistry.value?.itemKey === itemKey) return;
    groupRegistry.value = new ClozeGroupStyleRegistry(
      itemKey,
      passageGroupRefs(attempt.item),
    );
  },
  { immediate: true },
);

const passageView = computed(() => {
  const attempt = review.attempt.value;
  if (attempt?.item.stage !== "passage_cloze" || !groupRegistry.value)
    return null;
  return presentPassageCloze({
    item: attempt.item,
    registry: groupRegistry.value,
    answers: clozeAnswers.value,
    incorrectBlankIds: review.state.value.incorrectBlankIds,
    activeBlankId: activeBlankId.value,
  });
});

function actionId(): string {
  return crypto.randomUUID();
}

async function submit() {
  const attempt = review.attempt.value;
  if (!attempt) return;
  if (attempt.item.stage === "spelling") {
    await review.act({
      actionId: actionId(),
      itemId: attempt.item.itemId,
      action: "answer",
      answer: spellingAnswer.value,
    });
    return;
  }
  await review.act(
    buildPassageAnswer(attempt.item, clozeAnswers.value, actionId()),
  );
}

async function skip() {
  const item = review.attempt.value?.item;
  if (!item) return;
  await review.act({
    actionId: actionId(),
    itemId: item.itemId,
    action: "skip",
  });
}

async function restart() {
  const mode = summaryView.value?.mode;
  if (!mode || restartPending.value) return;
  restartPending.value = true;
  try {
    const nextSessionId = await review.restartCompletedSession();
    if (!nextSessionId) return;
    await review.ensureAttempt();
    await navigateTo({
      path: `/review/${encodeURIComponent(nextSessionId)}`,
      query:
        mode === "single_batch" && sourceBatchId
          ? { batch: sourceBatchId }
          : {},
    });
  } finally {
    restartPending.value = false;
  }
}
</script>

<template>
  <section class="container page-section">
    <LearnerPageBoundary :view="access.view.value" @retry="access.retry">
      <div class="review-shell">
        <template v-if="review.state.value.session?.status === 'active'">
          <div class="review-context">
            <div class="review-context-copy">
              <span class="status-badge status-info review-source-badge">{{
                isSingleBatch
                  ? $t("review.singleSource")
                  : $t("review.rangeSource")
              }}</span>
              <span
                v-if="
                  review.state.value.session.status === 'active' &&
                  isSingleBatch
                "
                class="review-context-detail"
                >{{
                  format.date(review.state.value.session.currentBatch.savedAt)
                }}
                ·
                {{
                  format.scenario(
                    review.state.value.session.currentBatch.scenario,
                  )
                }}</span
              >
              <span
                v-else-if="review.state.value.session.dateRange"
                class="review-context-detail"
                >{{ review.state.value.session.dateRange.startDate }} —
                {{ review.state.value.session.dateRange.endDate }}</span
              >
            </div>
            <NuxtLink
              class="button button-quiet button-small"
              :to="returnPath"
              >{{
                isSingleBatch
                  ? $t("review.backToLibrary")
                  : $t("review.backToSetup")
              }}</NuxtLink
            >
          </div>
          <div
            v-if="review.state.value.session.status === 'active'"
            class="review-progress"
          >
            <div
              class="progress-labels"
              :aria-label="
                $t('review.batchProgress', {
                  current: review.state.value.session.progress.completedBatches,
                  total: review.state.value.session.progress.totalBatches,
                })
              "
            >
              <span>{{
                isSingleBatch
                  ? $t("review.storyProgress", { current: 1, total: 1 })
                  : $t("review.roundProgress", {
                      current:
                        review.state.value.session.progress.completedBatches +
                        1,
                      total: review.state.value.session.progress.totalBatches,
                    })
              }}</span>
              <span v-if="review.attempt.value">{{
                review.attempt.value.item.stage === "spelling"
                  ? $t("review.wordStep", {
                      current: review.attempt.value.progress.itemNumber,
                      total: review.attempt.value.progress.itemsInStage,
                    })
                  : $t("review.storyStep")
              }}</span>
            </div>
            <div class="progress-track">
              <span :style="{ width: `${progressPercent}%` }" />
            </div>
          </div>
        </template>

        <AppError :failure="review.state.value.failure" />

        <article
          v-if="review.state.value.session?.status === 'completed'"
          class="review-card review-summary-card"
        >
          <div v-if="summaryView" class="empty-symbol" aria-hidden="true">
            {{ summaryView.symbol }}
          </div>
          <p v-if="summaryView" class="eyebrow">{{ summaryView.eyebrow }}</p>
          <h1 v-if="summaryView" class="page-title">{{ summaryView.title }}</h1>
          <p v-if="summaryView" class="page-description">
            {{ summaryView.description }}
          </p>
          <div class="stats-grid review-summary-stats">
            <div class="stat-card">
              <div class="stat-value">
                {{ summaryView?.completed }}
              </div>
              <div class="stat-label">{{ $t("review.completedCount") }}</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">
                {{ summaryView?.mastered }}
              </div>
              <div class="stat-label">{{ $t("review.masteredCount") }}</div>
            </div>
            <div class="stat-card">
              <div class="stat-value">
                {{ summaryView?.revisit }}
              </div>
              <div class="stat-label">{{ $t("review.revisitCount") }}</div>
            </div>
          </div>
          <div class="inline-actions review-summary-actions">
            <NuxtLink class="button button-secondary" to="/library">{{
              summaryView?.returnLabel
            }}</NuxtLink
            ><button
              class="button button-primary"
              type="button"
              :disabled="restartPending"
              @click="restart"
            >
              {{ summaryView?.restartLabel }}
            </button>
          </div>
        </article>

        <article v-else-if="review.attempt.value" class="review-card">
          <template v-if="review.attempt.value.item.stage === 'spelling'">
            <span class="review-stage">{{ $t("review.recall") }}</span>
            <div class="review-prompt">
              {{ review.attempt.value.item.entryMeaning }}
            </div>
            <div class="hint-row">
              <label class="switch"
                ><input v-model="showHint" type="checkbox" /><span
                  class="switch-track"
                  aria-hidden="true"
                /><span>{{ $t("review.hint") }}</span></label
              >
            </div>
            <p v-if="showHint" id="review-hint" class="hint-phrase">
              <template
                v-for="(segment, index) in review.attempt.value.item
                  .hintSegments"
                :key="index"
                ><span
                  v-if="segment.kind === 'blank'"
                  class="blank"
                  aria-hidden="true"
                  >••••••</span
                ><span v-else>{{ segment.text }}</span></template
              >
            </p>
            <label class="sr-only" for="review-spelling-answer">{{
              $t("review.spell")
            }}</label>
            <input
              id="review-spelling-answer"
              v-model="spellingAnswer"
              class="text-input review-answer"
              :placeholder="$t('review.spell')"
              :aria-describedby="showHint ? 'review-hint' : undefined"
              autocomplete="off"
              autocapitalize="none"
              spellcheck="false"
              @keyup.enter="submit"
            />
          </template>
          <template v-else>
            <span class="review-stage">{{ $t("review.complete") }}</span>
            <p class="helper">{{ $t("review.completeCopy") }}</p>
            <PassageClozeQuestion
              v-if="passageView"
              :model="passageView"
              @answer-changed="
                (blankId, value) => (clozeAnswers[blankId] = value)
              "
              @blank-focused="activeBlankId = $event"
              @blank-blurred="activeBlankId = null"
            />
          </template>
          <div
            v-if="
              review.state.value.status === 'ready' &&
              review.state.value.incorrect
            "
            class="feedback feedback-error"
            role="alert"
          >
            {{ $t("review.incorrect") }}
          </div>
          <footer class="card-footer review-card-actions">
            <button
              class="button button-quiet"
              type="button"
              :disabled="review.state.value.status === 'submitting'"
              @click="skip"
            >
              {{ $t("common.skip") }}
            </button>
            <button
              class="button button-primary"
              type="button"
              :disabled="review.state.value.status === 'submitting'"
              @click="submit"
            >
              {{
                review.attempt.value.item.stage === "spelling"
                  ? $t("review.check")
                  : $t("review.finish")
              }}
            </button>
          </footer>
        </article>
        <div v-else class="skeleton" :aria-label="$t('common.loading')" />
      </div>
    </LearnerPageBoundary>
  </section>
</template>
