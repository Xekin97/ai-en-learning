<script setup lang="ts">
import {
  stableClozeRegistry,
  CLOZE_TONES,
} from "@presentation/review/cloze-group-style-registry";
import type { ClozeGroupRef } from "@application/shared/models";
import { useLearnerAccess } from "@presentation/controllers/learner-access";
import type { DeepReadonly } from "vue";
import type { WordQuestion } from "@application/review/models";
const access = useLearnerAccess(),
  review = useReviewStore(),
  route = useRoute(),
  { copy } = useDesignCopy(),
  format = useDisplayFormatters();
const id = String(route.params.sessionId),
  hint = ref(false);
const attempt = computed(() => review.attempt.value),
  draft = computed(() => review.draft.value),
  comparison = computed(() => review.comparison.value),
  session = computed(() => review.session.value);
const navigation = computed(() => draft.value?.navigation),
  step = computed(() => navigation.value?.step ?? 0),
  word = computed(() => attempt.value?.words[step.value]);
const overview = computed(() => navigation.value?.stage === "overview"),
  result = computed(() => review.phase.value === "comparison");
const answered = computed(() =>
  word.value
    ? (draft.value?.wordInputs[word.value.questionId] ?? []).some((v) =>
        v.trim(),
      )
    : Object.values(draft.value?.passageInputs ?? {}).some((v) => v.trim()),
);
const symbols = [
  "circle",
  "diamond",
  "triangle",
  "square",
  "star",
  "hexagon",
] as const;
const registry = computed(() =>
  attempt.value
    ? stableClozeRegistry(
        attempt.value.attemptId,
        attempt.value.passage.flatMap((s) =>
          s.kind === "blank" ? [s.groupRef] : [],
        ),
      )
    : null,
);
const activeGroup = ref<ClozeGroupRef | null>(null);
function groupIndex(ref: ClozeGroupRef) {
  const style = registry.value?.styleFor(ref);
  return style ? CLOZE_TONES.indexOf(style.toneToken) : 0;
}
function groupClasses(ref: ClozeGroupRef) {
  const style = registry.value?.styleFor(ref);
  return [
    `group-${groupIndex(ref) % 3}`,
    `cloze-pattern-${style?.patternToken ?? "solid"}`,
    { "cloze-muted": activeGroup.value !== null && activeGroup.value !== ref },
  ];
}
const groups = computed(
  () =>
    attempt.value?.passage.flatMap((s) => (s.kind === "blank" ? [s] : [])) ??
    [],
);
function answer(w: DeepReadonly<WordQuestion>) {
  return review.answerFor(w as WordQuestion);
}
function goto(index: number, fromOverview = overview.value) {
  if (!navigation.value) return;
  review.navigate({
    ...navigation.value,
    step: index,
    stage: "editing",
    returnToOverview: fromOverview,
  });
  hint.value = false;
}
function showOverview() {
  if (navigation.value)
    review.navigate({ ...navigation.value, stage: "overview" });
}
function next(skip = false) {
  if (!attempt.value || !navigation.value) return;
  if (skip) {
    if (word.value)
      review.word(
        word.value.questionId,
        (draft.value?.wordInputs[word.value.questionId] ?? []).map(() => ""),
      );
    else groups.value.forEach((g) => review.passage(g.blankId, ""));
  }
  if (
    navigation.value.returnToOverview ||
    step.value >= attempt.value.words.length
  )
    showOverview();
  else goto(step.value + 1, false);
}
async function advance() {
  if (session.value?.status === "active") await review.begin();
  else
    await navigateTo(session.value?.mode === "range" ? "/review" : "/library");
}
await access.initialize(async () => {});
onMounted(async () => {
  if (access.isLearner.value) {
    const start = route.query.start === "1";
    if (start)
      await navigateTo(
        {
          path: route.path,
          query: { ...(route.query.batch ? { batch: route.query.batch } : {}) },
        },
        { replace: true },
      );
    await review.load(id, start);
  }
});
useLocalizedHead("common.review");
</script>
<template>
  <LearnerPageBoundary :view="access.view.value" @retry="access.retry"
    ><div class="page-head">
      <div>
        <h1>
          {{
            copy(
              result
                ? review.receipt.value?.successful
                  ? "summary.good"
                  : "summary.retry"
                : overview
                  ? "overview.title"
                  : "review.title",
            )
          }}
        </h1>
        <p v-if="overview">{{ copy("overview.desc") }}</p>
      </div>
    </div>
    <AppError :failure="review.failure.value" />
    <p v-if="review.storageFailed.value" class="note error" role="alert">
      {{ copy("failed") }}
      <button class="btn small" @click="review.flush">
        {{ copy("retry") }}
      </button>
    </p>
    <div v-if="session" class="review-context">
      <span
        >{{ session.progress.completedBatches }} /
        {{ session.progress.totalBatches
        }}<template v-if="session.currentBatch">
          · {{ format.date(session.currentBatch.savedAt) }}</template
        ></span
      ><NuxtLink
        class="btn quiet"
        :to="session.mode === 'range' ? '/review' : '/library'"
        >{{
          copy(session.mode === "range" ? "l.backRange" : "l.backLibrary")
        }}</NuxtLink
      >
    </div>
    <p v-if="result && review.receipt.value?.successful" class="notice">
      {{ copy("newmastery", { count: review.newMasteries() }) }}
    </p>
    <div
      v-if="(attempt && draft && review.phase.value === 'editing') || result"
      class="review-layout"
    >
      <aside class="review-steps">
        <button
          v-for="(key, index) in [
            'wordanswers',
            'passageanswers',
            'overview',
            ...(result ? ['summary'] : []),
          ]"
          :key="key"
          class="btn"
          :class="{
            current: result
              ? index === 3
              : overview
                ? index === 2
                : word
                  ? index === 0
                  : index === 1,
          }"
          :disabled="result"
          @click="
            index === 0
              ? goto(0)
              : index === 1
                ? goto(attempt!.words.length)
                : showOverview()
          "
        >
          {{ copy(key) }}
        </button>
      </aside>
      <div class="review-main">
        <template v-if="overview || result"
          ><section class="review-paper">
            <h2>{{ copy("wordanswers") }}</h2>
            <template v-if="result && comparison"
              ><div
                v-for="(item, index) in comparison.words"
                :key="index"
                class="answer-row"
              >
                <span class="muted">{{ index + 1 }}</span
                ><ReviewComparison :answer="item" /></div></template
            ><template v-else
              ><div
                v-for="(question, index) in attempt?.words"
                :key="question.questionId"
                class="answer-row"
              >
                <span class="muted">{{ index + 1 }}</span
                ><button class="answer-link" @click="goto(index, true)">
                  {{ answer(question) || copy("unanswered")
                  }}<AppIcon name="pencil" />
                </button></div
            ></template>
            <h2 class="section">{{ copy("passageanswers") }}</h2>
            <p class="story-text" data-region="passage">
              <template v-if="result && comparison"
                ><template
                  v-for="(segment, index) in comparison.passage"
                  :key="index"
                  ><template v-if="segment.kind === 'text'">{{
                    segment.text
                  }}</template
                  ><ReviewComparison
                    v-else
                    :answer="segment" /></template></template
              ><template v-else
                ><template
                  v-for="(segment, index) in attempt?.passage"
                  :key="index"
                  ><template v-if="segment.kind === 'text'">{{
                    segment.text
                  }}</template
                  ><button
                    v-else
                    class="answer-link"
                    :class="groupClasses(segment.groupRef)"
                    @click="goto(attempt!.words.length, true)"
                  >
                    {{
                      draft?.passageInputs[segment.blankId] ||
                      copy("unanswered")
                    }}
                  </button></template
                ></template
              >
            </p>
            <p v-if="result" class="note">{{ copy("summary.note") }}</p>
          </section>
          <div class="review-footer">
            <button
              class="btn"
              @click="result ? review.restart() : goto(step, false)"
            >
              {{ copy(result ? "restart" : "back") }}</button
            ><button
              class="btn primary"
              @click="result ? advance() : review.submit()"
            >
              {{
                copy(
                  result
                    ? session?.status === "active"
                      ? "nextbatch"
                      : "finish"
                    : "submit",
                )
              }}
            </button>
          </div></template
        >
        <template v-else-if="attempt && draft"
          ><section v-if="word" class="review-paper">
            <p class="eyebrow">
              {{
                copy("step", { index: step + 1, total: attempt.words.length })
              }}
            </p>
            <h2>{{ copy("review.spell") }}</h2>
            <LetterSlots
              :key="word.questionId"
              :slots="word.slots"
              :values="draft.wordInputs[word.questionId] ?? []"
              @change="review.word(word!.questionId, $event)"
            />
            <section class="hint">
              <small>{{ copy("review.translation") }}</small>
              <p>{{ word.entryMeaning }}</p>
            </section>
            <section class="hint">
              <div class="actions">
                <small>{{ copy("review.phrase") }}</small
                ><button
                  class="btn quiet small"
                  :aria-expanded="hint"
                  @click="hint = !hint"
                >
                  {{ copy(hint ? "hide" : "show") }}
                </button>
              </div>
              <p v-if="hint" class="story-text">
                <template v-for="(segment, index) in word.hint" :key="index">{{
                  segment.kind === "text" ? segment.text : "________"
                }}</template>
              </p>
            </section>
          </section>
          <section v-else class="review-paper">
            <h2>{{ copy("review.passage") }}</h2>
            <p class="muted">{{ copy("l.groups") }}</p>
            <p class="story-text" data-region="passage">
              <template v-for="(segment, index) in attempt.passage" :key="index"
                ><template v-if="segment.kind === 'text'">{{
                  segment.text
                }}</template
                ><span
                  v-else
                  class="gap-wrap"
                  :class="groupClasses(segment.groupRef)"
                  ><span aria-hidden="true"
                    ><AppIcon
                      :name="
                        symbols[groupIndex(segment.groupRef) % 6]!
                      " /></span
                  ><input
                    class="gap"
                    :value="draft.passageInputs[segment.blankId] ?? ''"
                    :aria-label="`${copy('gap', { index: groups.findIndex((g) => g.blankId === segment.blankId) + 1 })} · ${copy('l.group', { symbol: registry?.styleFor(segment.groupRef).anonymousName ?? '' })}`"
                    autocomplete="off"
                    :spellcheck="false"
                    autocapitalize="none"
                    @focus="activeGroup = segment.groupRef"
                    @blur="activeGroup = null"
                    @input="
                      review.passage(
                        segment.blankId,
                        ($event.target as HTMLInputElement).value,
                      )
                    " /></span
              ></template>
            </p>
          </section>
          <div class="review-footer">
            <button
              class="btn"
              :disabled="step === 0"
              @click="goto(step - 1, false)"
            >
              {{ copy("previous") }}
            </button>
            <div class="actions">
              <button class="btn quiet" @click="next(true)">
                {{ copy("skip") }}</button
              ><button
                class="btn primary"
                :disabled="!answered"
                @click="next()"
              >
                {{ copy("next") }}
              </button>
            </div>
          </div></template
        >
      </div>
    </div>
    <p
      v-else-if="
        review.phase.value === 'loading' || review.phase.value === 'submitting'
      "
      role="status"
    >
      {{ copy("loading") }}
    </p>
    <section
      v-else-if="
        session?.status === 'completed' && review.phase.value === 'receipt'
      "
      class="panel session-totals"
    >
      <h2>{{ copy("l.sessiondone") }}</h2>
      <dl class="stats">
        <div>
          <dt>{{ copy("l.total.completed") }}</dt>
          <dd>
            {{ session.progress.completedBatches }} /
            {{ session.progress.totalBatches }}
          </dd>
        </div>
        <div>
          <dt>{{ copy("l.total.success") }}</dt>
          <dd>{{ session.progress.successfulBatches }}</dd>
        </div>
        <div>
          <dt>{{ copy("l.total.failed") }}</dt>
          <dd>{{ session.progress.unsuccessfulBatches }}</dd>
        </div>
        <div>
          <dt>{{ copy("l.total.skipped") }}</dt>
          <dd>{{ session.progress.skippedBatches }}</dd>
        </div>
      </dl>
      <p class="muted">{{ copy("l.summary.unavailable") }}</p>
      <div class="actions">
        <button v-if="review.receipt.value" class="btn" @click="review.restart">
          {{ copy("restart") }}</button
        ><NuxtLink
          class="btn primary"
          :to="session.mode === 'range' ? '/review' : '/library'"
          >{{
            copy(session.mode === "range" ? "l.backRange" : "l.backLibrary")
          }}</NuxtLink
        >
      </div>
    </section>
    <section v-else class="empty">
      <h2>
        {{
          copy(
            review.phase.value === "receipt"
              ? "finish"
              : review.phase.value === "unavailable"
                ? "l.unavailable"
                : "review.title",
          )
        }}
      </h2>
      <p v-if="review.phase.value === 'receipt'">
        {{ copy("l.summary.unavailable") }}
      </p>
      <div class="actions">
        <button
          v-if="session?.status === 'active' && !review.attempt.value"
          class="btn primary"
          @click="review.begin"
        >
          {{ copy("start") }}</button
        ><button
          v-if="review.attempt.value"
          class="btn"
          @click="review.load(id)"
        >
          {{ copy("resume") }}</button
        ><button
          v-if="review.attempt.value"
          class="btn"
          @click="review.restart()"
        >
          {{ copy("restart") }}</button
        ><NuxtLink class="btn" to="/library">{{
          copy("l.backLibrary")
        }}</NuxtLink>
      </div>
    </section>
    <AppDialog
      id="restore-draft"
      :open="review.restoreOpen.value"
      :title="copy('resume.title')"
      @close="review.closeRestore"
      ><p>{{ copy("l.resume.desc") }}</p>
      <template #footer
        ><button class="btn" @click="review.restart">{{ copy("fresh") }}</button
        ><button class="btn primary" @click="review.restore">
          {{ copy("resume") }}
        </button></template
      ></AppDialog
    >
  </LearnerPageBoundary>
</template>
