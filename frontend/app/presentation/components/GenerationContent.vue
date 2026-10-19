<script setup lang="ts">
import type {
  CompletionNoticeModel,
  ContentActivityModel,
  ContentDraftStateModel,
  DisplaySegmentModel,
  GenerationResultModel,
  PlanPreviewItemModel,
} from "@application/shared/models";
import type { DeepReadonly } from "vue";
import { paragraphTexts } from "@application/generation/draft-reducer";
import { useContentPresentation } from "@presentation/generation/use-content-presentation";

const props = withDefaults(
  defineProps<{
    draft: DeepReadonly<ContentDraftStateModel>;
    planItems: readonly PlanPreviewItemModel[];
    result: DeepReadonly<GenerationResultModel> | null;
    phase: string;
    requestPhase: string | null;
    activity: ContentActivityModel | null;
    completionNotice: CompletionNoticeModel;
    resultHeading?: string | undefined;
    variant?: "create" | "preview" | undefined;
    pronunciationEnabled?: boolean;
  }>(),
  {
    resultHeading: undefined,
    variant: undefined,
    pronunciationEnabled: false,
  },
);
const { copy } = useDesignCopy();
const pronunciation = useNuxtApp().$pronunciation;
const draftRef = computed(() => props.draft);
const passageHost = ref<HTMLElement | null>(null);
const terminal = computed(
  () =>
    props.result !== null ||
    ["finalizing", "valid", "validated", "failed", "cancelled"].includes(
      props.phase,
    ) ||
    props.requestPhase === "finalizing",
);
const { paragraphs, typing, reduced } = useContentPresentation(
  draftRef,
  terminal,
  passageHost,
);
const paragraphSegments = computed<DisplaySegmentModel[][]>(() => {
  if (!props.result)
    return paragraphs.value.map((text) => [{ kind: "text", text }]);
  const lengths = paragraphTexts(props.result.passage).map(
    (text) => text.length,
  );
  const output = lengths.map(() => [] as DisplaySegmentModel[]);
  let paragraphIndex = 0;
  let remaining = lengths[0] ?? 0;
  for (const segment of props.result.passageSegments) {
    let offset = 0;
    while (offset < segment.text.length && paragraphIndex < output.length) {
      const take = Math.min(remaining, segment.text.length - offset);
      output[paragraphIndex]!.push({
        kind: segment.kind,
        text: segment.text.slice(offset, offset + take),
      });
      offset += take;
      remaining -= take;
      if (remaining === 0) {
        paragraphIndex++;
        remaining = lengths[paragraphIndex] ?? 0;
      }
    }
  }
  return output;
});
const visiblePlanItems = ref<readonly PlanPreviewItemModel[]>([
  ...props.planItems,
]);
const planEntering = ref(false);
const draftEntering = ref(false);
const sceneEntering = ref(false);
const planLeaving = ref(false);
const planLeaveTo = ref(false);
let planTimer: ReturnType<typeof setTimeout> | null = null;
let planEnterTimer: ReturnType<typeof setTimeout> | null = null;
let draftEnterTimer: ReturnType<typeof setTimeout> | null = null;
let sceneEnterTimer: ReturnType<typeof setTimeout> | null = null;
let planEffectVersion = 0;
let planHeightAnimation: Animation | null = null;
const planPronunciationSurface = computed(
  () => `generation-plan:${props.draft.draftId ?? "pending"}`,
);
const resultPronunciationSurface = computed(
  () => `generation-result:${props.draft.draftId ?? "pending"}`,
);
type PronunciationFocusRequest = {
  entry: string;
  source: HTMLElement;
};
let pronunciationFocusRequest: PronunciationFocusRequest | null = null;

function capturePlanPronunciationFocus() {
  const focused = document.activeElement;
  if (!(focused instanceof HTMLElement)) return;
  const action = focused.closest<HTMLElement>("[data-pronunciation-action]");
  if (!action?.closest("#planning-preview")) return;
  const entry = action.dataset.pronEntry;
  if (entry) pronunciationFocusRequest = { entry, source: action };
}

function clearPronunciationFocusRequest() {
  pronunciationFocusRequest = null;
}

function restorePronunciationFocus() {
  const request = pronunciationFocusRequest;
  if (!request || !props.result) return;
  const active = document.activeElement;
  if (active && active !== document.body && active !== request.source) {
    clearPronunciationFocusRequest();
    return;
  }
  const result = document.getElementById("final-result");
  const matching = [
    ...(result?.querySelectorAll<HTMLElement>("[data-pronunciation-action]") ??
      []),
  ].find((element) => element.dataset.pronEntry === request.entry);
  const target = matching ?? document.getElementById("generation-status");
  if (
    target?.isConnected &&
    !(target instanceof HTMLButtonElement && target.disabled)
  )
    target.focus({ preventScroll: true });
  clearPronunciationFocusRequest();
}

function enterFor(
  state: Ref<boolean>,
  currentTimer: () => ReturnType<typeof setTimeout> | null,
  setTimer: (timer: ReturnType<typeof setTimeout> | null) => void,
) {
  const timer = currentTimer();
  if (timer) clearTimeout(timer);
  if (reduced.value) {
    state.value = false;
    setTimer(null);
    return;
  }
  state.value = true;
  setTimer(
    setTimeout(() => {
      state.value = false;
      setTimer(null);
    }, 180),
  );
}

function enterPlan() {
  enterFor(
    planEntering,
    () => planEnterTimer,
    (timer) => (planEnterTimer = timer),
  );
}

function enterDraft() {
  enterFor(
    draftEntering,
    () => draftEnterTimer,
    (timer) => (draftEnterTimer = timer),
  );
}

function enterScene() {
  enterFor(
    sceneEntering,
    () => sceneEnterTimer,
    (timer) => (sceneEnterTimer = timer),
  );
}
const planVocabulary = computed(() =>
  visiblePlanItems.value.flatMap((item) =>
    item.kind === "word_use"
      ? [
          {
            entry: item.entry,
            meaning: item.sense,
            usage: `${item.form} · ${item.phrase}`,
          },
        ]
      : [],
  ),
);

watch(
  () => props.planItems,
  async (items, previous, onCleanup) => {
    const version = ++planEffectVersion;
    let invalidated = false;
    onCleanup(() => {
      invalidated = true;
    });
    if (items.length) {
      if (!previous.length) enterPlan();
      else if (
        items.some((item) => item.kind === "scene") &&
        !previous.some((item) => item.kind === "scene")
      )
        enterScene();
      if (planTimer) clearTimeout(planTimer);
      planHeightAnimation?.cancel();
      planHeightAnimation = null;
      planTimer = null;
      planLeaving.value = false;
      planLeaveTo.value = false;
      visiblePlanItems.value = [...items];
      return;
    }
    if (!visiblePlanItems.value.length) return;
    capturePlanPronunciationFocus();
    pronunciation?.cancelSurface(planPronunciationSurface.value);
    if (reduced.value) {
      visiblePlanItems.value = [];
      return;
    }
    planLeaving.value = true;
    await nextTick();
    if (invalidated || version !== planEffectVersion) return;
    const plan = document.getElementById("planning-preview");
    if (plan && typeof plan.animate === "function") {
      const height = plan.getBoundingClientRect().height;
      planHeightAnimation = plan.animate(
        { height: [`${height}px`, "0px"] },
        {
          duration: 240,
          easing: "cubic-bezier(.22,.75,.26,1)",
          fill: "forwards",
        },
      );
    } else plan?.getBoundingClientRect();
    planLeaveTo.value = true;
    planTimer = setTimeout(() => {
      if (version !== planEffectVersion) return;
      visiblePlanItems.value = [];
      planLeaving.value = false;
      planLeaveTo.value = false;
      planTimer = null;
      planHeightAnimation = null;
    }, 240);
  },
);

watch(
  () => Boolean(paragraphs.value.length || props.result),
  (visible, previous) => {
    if (visible && !previous) enterDraft();
  },
);
watch([() => props.result, planLeaving], restorePronunciationFocus, {
  flush: "post",
});
const resultVocabulary = computed(() =>
  (props.result?.targets ?? []).map((target) => ({
    entry: target.entry,
    meaning: target.entryMeaning,
    usage: target.hintPhrase,
  })),
);
const statusKey = computed(() => {
  if (props.phase === "pending") return "m003.pending.title";
  if (props.result) return "m003.complete";
  if (props.requestPhase === "planning") return "m003.planning";
  if (props.requestPhase === "finalizing") return "m003.finalizing";
  if (props.requestPhase === "composing")
    return props.activity === "improving"
      ? "m003.activity.improving"
      : "m003.composing";
  return "m003.accepted";
});
const showActivity = computed(
  () =>
    !terminal.value &&
    props.phase !== "pending" &&
    (typing.value || props.activity !== null),
);
const showPlanActivity = computed(
  () =>
    !terminal.value &&
    props.phase !== "pending" &&
    props.requestPhase === "planning",
);
const statusChanging = ref(false);
const previousParagraphs = ref<Record<number, string>>({});
const replacingParagraphs = ref<ReadonlySet<number>>(new Set());
const replacementTimers = new Map<number, ReturnType<typeof setTimeout>>();
const replacementHeightAnimations = new Map<number, Animation>();
let paragraphRegionAnimation: Animation | null = null;
let replacementEffectVersion = 0;
let pendingHeightIndices = new Set<number>();
let pendingRegionShrink = false;
const beforeParagraphHeights = new Map<number, number>();
let beforeParagraphRegionHeight = 0;
let pendingHeightVersion = 0;
let anchor: { index: string; top: number } | null = null;

function clearReplacementEffects() {
  replacementEffectVersion++;
  replacementTimers.forEach((timer) => clearTimeout(timer));
  replacementTimers.clear();
  replacingParagraphs.value = new Set();
  previousParagraphs.value = {};
  replacementHeightAnimations.forEach((animation) => {
    const target = (animation.effect as KeyframeEffect | null)
      ?.target as HTMLElement | null;
    if (target) delete target.dataset.heightMotion;
    animation.cancel();
  });
  replacementHeightAnimations.clear();
  paragraphRegionAnimation?.cancel();
  paragraphRegionAnimation = null;
  pendingHeightIndices.clear();
  pendingRegionShrink = false;
  beforeParagraphHeights.clear();
  beforeParagraphRegionHeight = 0;
}

function invalidateVisualEffects(clearPlan: boolean) {
  clearReplacementEffects();
  planEffectVersion++;
  if (planEnterTimer) clearTimeout(planEnterTimer);
  if (draftEnterTimer) clearTimeout(draftEnterTimer);
  if (sceneEnterTimer) clearTimeout(sceneEnterTimer);
  planEnterTimer = null;
  draftEnterTimer = null;
  sceneEnterTimer = null;
  planEntering.value = false;
  draftEntering.value = false;
  sceneEntering.value = false;
  if (planTimer) clearTimeout(planTimer);
  planHeightAnimation?.cancel();
  planHeightAnimation = null;
  planTimer = null;
  planLeaving.value = false;
  planLeaveTo.value = false;
  if (clearPlan) visiblePlanItems.value = [];
}

watch(
  () => [props.draft.draftId, props.phase] as const,
  ([draftId, phase], [previousDraftId]) => {
    if (draftId !== previousDraftId || ["failed", "cancelled"].includes(phase))
      clearPronunciationFocusRequest();
    if (
      draftId !== previousDraftId ||
      draftId === null ||
      ["pending", "failed", "cancelled"].includes(phase)
    )
      invalidateVisualEffects(false);
  },
  { flush: "sync" },
);

watch(statusKey, async () => {
  statusChanging.value = false;
  await nextTick();
  statusChanging.value = true;
});

watch(
  paragraphs,
  (after, before) => {
    const changed = props.draft.changedParagraphs.filter(
      (index) => before[index] !== undefined && before[index] !== after[index],
    );
    if (!changed.length || reduced.value) return;
    pendingHeightIndices = new Set(changed);
    pendingRegionShrink = after.length < before.length;
    pendingHeightVersion = replacementEffectVersion;
    for (const index of changed) {
      const height = passageHost.value
        ?.querySelector<HTMLElement>(`[data-paragraph-index='${index}']`)
        ?.getBoundingClientRect().height;
      if (height) beforeParagraphHeights.set(index, height);
    }
    if (pendingRegionShrink)
      beforeParagraphRegionHeight =
        passageHost.value
          ?.querySelector<HTMLElement>(".live-draft-text")
          ?.getBoundingClientRect().height ?? 0;
    const prior = { ...previousParagraphs.value };
    const active = new Set(replacingParagraphs.value);
    for (const index of changed) {
      prior[index] = before[index]!;
      active.add(index);
      const existing = replacementTimers.get(index);
      if (existing) clearTimeout(existing);
      replacementTimers.set(
        index,
        setTimeout(() => {
          const remaining = new Set(replacingParagraphs.value);
          remaining.delete(index);
          replacingParagraphs.value = remaining;
          replacementTimers.delete(index);
        }, 220),
      );
    }
    previousParagraphs.value = prior;
    replacingParagraphs.value = active;
  },
  { flush: "sync" },
);

watch(reduced, (value) => {
  if (!value) return;
  if (planEnterTimer) clearTimeout(planEnterTimer);
  if (draftEnterTimer) clearTimeout(draftEnterTimer);
  if (sceneEnterTimer) clearTimeout(sceneEnterTimer);
  planEnterTimer = null;
  draftEnterTimer = null;
  sceneEnterTimer = null;
  planEntering.value = false;
  draftEntering.value = false;
  sceneEntering.value = false;
  clearReplacementEffects();
  if (planLeaving.value) {
    if (planTimer) clearTimeout(planTimer);
    planHeightAnimation?.cancel();
    planHeightAnimation = null;
    planTimer = null;
    planLeaving.value = false;
    planLeaveTo.value = false;
    visiblePlanItems.value = [];
  }
});

const hideLeavingRegion = (element: Element) => {
  const node = element as HTMLElement;
  node.setAttribute("aria-hidden", "true");
  node.inert = true;
};

onBeforeUpdate(() => {
  if (pendingHeightIndices.size && !reduced.value && passageHost.value) {
    for (const index of pendingHeightIndices) {
      if (beforeParagraphHeights.has(index)) continue;
      const height = passageHost.value
        .querySelector<HTMLElement>(`[data-paragraph-index='${index}']`)
        ?.getBoundingClientRect().height;
      if (height) beforeParagraphHeights.set(index, height);
    }
    if (pendingRegionShrink && !beforeParagraphRegionHeight)
      beforeParagraphRegionHeight =
        passageHost.value
          .querySelector<HTMLElement>(".live-draft-text")
          ?.getBoundingClientRect().height ?? 0;
  }
  const visible = [
    ...(passageHost.value?.querySelectorAll<HTMLElement>(
      "[data-paragraph-index]",
    ) ?? []),
  ].find((node) => {
    const bounds = node.getBoundingClientRect();
    return bounds.bottom > 0 && bounds.top < window.innerHeight;
  });
  anchor = visible
    ? {
        index: visible.dataset.paragraphIndex!,
        top: visible.getBoundingClientRect().top,
      }
    : null;
});

onUpdated(() => {
  if (
    pendingHeightVersion === replacementEffectVersion &&
    !reduced.value &&
    passageHost.value?.isConnected
  ) {
    for (const index of pendingHeightIndices) {
      const node = passageHost.value.querySelector<HTMLElement>(
        `[data-paragraph-index='${index}']`,
      );
      const oldHeight = beforeParagraphHeights.get(index) ?? 0;
      const newHeight = node?.getBoundingClientRect().height ?? 0;
      if (!node || !oldHeight || oldHeight === newHeight) continue;
      replacementHeightAnimations.get(index)?.cancel();
      const animation = node.animate(
        { height: [`${oldHeight}px`, `${newHeight}px`] },
        {
          duration: 220,
          easing: "cubic-bezier(.22,.75,.26,1)",
        },
      );
      node.dataset.heightMotion = "220";
      replacementHeightAnimations.set(index, animation);
      animation.onfinish = animation.oncancel = () => {
        if (replacementHeightAnimations.get(index) === animation) {
          replacementHeightAnimations.delete(index);
          delete node.dataset.heightMotion;
        }
      };
    }
    if (pendingRegionShrink && beforeParagraphRegionHeight) {
      const region =
        passageHost.value.querySelector<HTMLElement>(".live-draft-text");
      const newHeight = region?.getBoundingClientRect().height ?? 0;
      if (region && newHeight !== beforeParagraphRegionHeight) {
        paragraphRegionAnimation?.cancel();
        paragraphRegionAnimation = region.animate(
          { height: [`${beforeParagraphRegionHeight}px`, `${newHeight}px`] },
          { duration: 180, easing: "cubic-bezier(.22,.75,.26,1)" },
        );
        paragraphRegionAnimation.onfinish = paragraphRegionAnimation.oncancel =
          () => {
            paragraphRegionAnimation = null;
          };
      }
    }
  }
  pendingHeightIndices.clear();
  pendingRegionShrink = false;
  beforeParagraphHeights.clear();
  beforeParagraphRegionHeight = 0;
  if (!anchor || !passageHost.value) return;
  const current = [
    ...passageHost.value.querySelectorAll<HTMLElement>(
      "[data-paragraph-index]",
    ),
  ].find((node) => node.dataset.paragraphIndex === anchor?.index);
  if (current) {
    const delta = current.getBoundingClientRect().top - anchor.top;
    if (delta) window.scrollBy({ top: delta, behavior: "instant" });
  }
  anchor = null;
});

onBeforeUnmount(() => {
  clearPronunciationFocusRequest();
  invalidateVisualEffects(true);
});

onMounted(() => {
  if (visiblePlanItems.value.length) enterPlan();
  if (paragraphs.value.length || props.result) enterDraft();
});
</script>

<template>
  <div class="m003-content" :data-content-phase="props.phase">
    <div class="m003-result-heading">
      <h2 v-if="props.variant === 'preview'">
        <AppIcon name="book-open" />{{ copy("preview") }}
      </h2>
      <span v-else class="eyebrow"
        ><AppIcon name="notebook-pen" />{{ copy("create") }}</span
      >
      <span
        class="draft-status pill m003-stream-status"
        :class="{ 'is-status-changing': statusChanging }"
        role="status"
        aria-live="polite"
      >
        <span class="m003-status-copy">{{ copy(statusKey) }}</span>
      </span>
    </div>

    <section
      v-if="visiblePlanItems.length"
      id="planning-preview"
      class="m003-plan-preview"
      :class="{
        'is-entering': planEntering,
        'm003-plan-leave-active': planLeaving,
        'm003-plan-leave-to': planLeaveTo,
      }"
      :aria-hidden="planLeaving || undefined"
      :inert="planLeaving"
    >
      <header>
        <span class="eyebrow">{{ copy("m003.plan.label") }}</span>
        <div v-if="showPlanActivity" class="m003-writing" aria-hidden="true">
          <i /><i /><i />
        </div>
      </header>
      <h2>{{ copy("m003.plan.title") }}</h2>
      <p class="m003-plan-note muted">{{ copy("m003.plan.note") }}</p>
      <template
        v-for="item in visiblePlanItems"
        :key="item.kind === 'scene' ? 'scene' : `word:${item.entry}`"
      >
        <div
          v-if="item.kind === 'scene'"
          class="m003-plan-scene plan-item"
          :class="{ 'is-entering': sceneEntering }"
        >
          <small>{{ copy("m003.plan.scene") }}</small>
          <p>{{ item.text }}</p>
        </div>
      </template>
      <GenerationVocabularyList
        v-if="planVocabulary.length"
        :items="planVocabulary"
        variant="plan"
        :reduced="reduced"
        :aria-label="copy('l.resources')"
        :pronunciation-enabled="props.pronunciationEnabled"
        :pronunciation-surface="planPronunciationSurface"
        :pronunciation-active="!planLeaving"
      />
    </section>

    <article
      v-if="paragraphs.length || props.result"
      :id="props.result ? 'final-result' : 'generation-content-passage'"
      ref="passageHost"
      class="m003-live-draft"
      :class="{
        'm003-final-result': props.result,
        'is-typing': typing,
        'is-entering': draftEntering,
      }"
      :aria-busy="typing || undefined"
    >
      <header>
        <span class="eyebrow">{{
          props.result ? copy("create.done") : copy("m003.draft.label")
        }}</span>
        <div v-if="showActivity" class="m003-writing" aria-hidden="true">
          <i /><i /><i />
        </div>
      </header>
      <h2 v-if="props.result">
        {{
          props.resultHeading ||
          props.result.targets.map((target) => target.entry).join(" · ")
        }}
      </h2>
      <h2 v-else>{{ copy("m003.draft.current.title") }}</h2>
      <TransitionGroup
        tag="div"
        name="m003-paragraph"
        :duration="reduced ? 0 : 180"
        class="story-text live-draft-text"
        :class="{ 'is-typing': typing }"
        lang="en"
        @before-leave="hideLeavingRegion"
      >
        <span
          v-for="(segments, index) in paragraphSegments"
          :key="index"
          class="m003-story-paragraph"
          :class="{
            'is-changed': props.draft.changedParagraphs.includes(index),
            'is-replacing': replacingParagraphs.has(index),
          }"
          :data-paragraph-index="index"
        >
          <span
            v-if="replacingParagraphs.has(index)"
            class="m003-replacement-ghost"
            aria-hidden="true"
            inert
            >{{ previousParagraphs[index] }}</span
          >
          <template
            v-for="(segment, segmentIndex) in segments"
            :key="segmentIndex"
          >
            <mark v-if="segment.kind === 'target'">{{ segment.text }}</mark
            ><template v-else>{{ segment.text }}</template>
          </template>
        </span>
      </TransitionGroup>
      <p
        v-if="props.completionNotice === 'content_review_incomplete'"
        class="notice warn"
      >
        {{ copy("m003.incomplete") }}
      </p>
      <template v-if="props.result">
        <div class="chips">
          <span v-for="tag in props.result.tags" :key="tag" class="chip">{{
            tag
          }}</span>
        </div>
        <GenerationVocabularyList
          :items="resultVocabulary"
          variant="result"
          :reduced="reduced"
          :heading="copy('l.resources')"
          :pronunciation-enabled="props.pronunciationEnabled"
          :pronunciation-surface="resultPronunciationSurface"
        />
      </template>
    </article>
  </div>
</template>
