<script setup lang="ts">
import type {
  GenerationRequestModel,
  MeaningLanguage,
  PassageLength,
  Scenario,
} from "@application/shared/models";
const props = defineProps<{ presetId?: string }>();
const workspace = useGenerationStore(),
  presets = usePresetsStore(),
  session = useSessionStore();
const { copy } = useDesignCopy(),
  format = useDisplayFormatters(),
  feedback = useFeedbackStore();
const locked = computed(() => Boolean(props.presetId)),
  options = computed(() => workspace.state.value.options),
  detail = computed(() => presets.state.value.detail),
  preset = computed(() => detail.value?.preset);
const state = computed(() => workspace.state.value),
  generation = computed(() => state.value.generation);
const generationBusy = computed(() =>
  ["streaming", "pending"].includes(generation.value.phase),
);
const hasUnsavedResult = computed(
  () => generation.value.phase === "valid" && generation.value.result !== null,
);
const words = computed(() =>
  locked.value
    ? (preset.value?.configuration.entries ?? [])
    : state.value.selectedEntries,
);
const quota = computed(() =>
  locked.value ? detail.value?.quota : options.value?.quota,
);
const extra = computed(() =>
  locked.value
    ? detail.value?.extraQuota.remaining
    : options.value?.extraQuota.remaining,
);
const settings = ref<HTMLDetailsElement>();
const generateButton = ref<HTMLButtonElement | null>(null);
let restoreGenerateFocus = false;
const regenerateCancelButton = ref<HTMLButtonElement | null>(null);
const actionOwner = ref<"save" | "regenerate" | "leave" | null>(null);
const interactionLocked = computed(
  () => generationBusy.value || actionOwner.value !== null,
);
const protectLeave = computed(
  () => generationBusy.value || hasUnsavedResult.value,
);
const regenerateFailure = ref(false);
let actionSequence = 0;
let componentActive = true;
let allowLeave = false;
workspace.startNewTask();
await usePageLoader(`generation:${props.presetId ?? "ordinary"}`, () =>
  props.presetId ? presets.detail(props.presetId) : workspace.loadOptions(true),
);
onMounted(() => {
  if (settings.value) settings.value.open = locked.value || innerWidth > 1100;
});
watch(
  () => generation.value.phase,
  async (phase, previous) => {
    if (
      phase === "pending" &&
      previous === "streaming" &&
      document.activeElement === generateButton.value
    )
      restoreGenerateFocus = true;
    if (
      restoreGenerateFocus &&
      ["valid", "failed", "cancelled"].includes(phase)
    ) {
      await nextTick();
      if (generateButton.value?.disabled) return;
      if (
        restoreGenerateFocus &&
        generateButton.value?.isConnected &&
        (document.activeElement === document.body ||
          document.activeElement === null)
      ) {
        generateButton.value.focus({ preventScroll: true });
        restoreGenerateFocus = false;
      }
    }
  },
  { flush: "sync" },
);
watch(
  () => workspace.canSubmit.value,
  async (canSubmit) => {
    if (
      !canSubmit ||
      !restoreGenerateFocus ||
      !["valid", "failed", "cancelled"].includes(generation.value.phase)
    )
      return;
    await nextTick();
    if (
      restoreGenerateFocus &&
      generateButton.value?.isConnected &&
      !generateButton.value.disabled &&
      (document.activeElement === document.body ||
        document.activeElement === null)
    ) {
      generateButton.value.focus({ preventScroll: true });
      restoreGenerateFocus = false;
    }
  },
  { flush: "post" },
);
function rememberGenerateFocus() {
  restoreGenerateFocus = true;
}
function releaseGenerateFocus(event: FocusEvent) {
  if (
    event.relatedTarget !== null ||
    !["pending", "valid", "failed", "cancelled"].includes(
      generation.value.phase,
    )
  )
    restoreGenerateFocus = false;
}
function requestSnapshot(): GenerationRequestModel | null {
  const selected = preset.value;
  if (locked.value)
    return selected
      ? {
          kind: "preset",
          presetId: selected.id,
          publishedVersion: selected.publishedVersion,
        }
      : null;
  const value = state.value;
  if (
    !value.modelId ||
    !value.meaningLanguage ||
    !value.scenario ||
    !value.length ||
    value.selectedEntries.length === 0 ||
    !workspace.canSubmit.value
  )
    return null;
  return {
    modelId: value.modelId,
    meaningLanguage: value.meaningLanguage,
    scenario: value.scenario,
    length: value.length,
    entries: [...value.selectedEntries],
  };
}
async function startGeneration(snapshot: GenerationRequestModel) {
  const ok = await workspace.generate(snapshot);
  if (locked.value && props.presetId && !ok)
    await presets.detail(props.presetId);
  else if (!locked.value) await workspace.loadOptions(true);
}
type RegenerateBinding = {
  generation: typeof generation.value;
  runId: string;
  sessionEpoch: number;
};
let regenerateBinding: RegenerateBinding | null = null;
async function generate() {
  if (actionOwner.value || generationBusy.value) return;
  regenerateFailure.value = false;
  if (hasUnsavedResult.value) {
    const current = generation.value;
    if (!current.runId) return;
    regenerateBinding = {
      generation: current,
      runId: current.runId,
      sessionEpoch: session.epoch.value,
    };
    confirmation.value = "regenerate";
    return;
  }
  const snapshot = requestSnapshot();
  if (snapshot) await startGeneration(snapshot);
}
async function save() {
  if (actionOwner.value || generationBusy.value) return;
  const owner = ++actionSequence;
  actionOwner.value = "save";
  try {
    const result = await workspace.save();
    allowLeave = true;
    await navigateTo(
      result.kind === "saved"
        ? `/library/${encodeURIComponent(result.batchId)}`
        : { path: "/login", query: { claim: "1", redirect: "/library" } },
    );
  } catch {
    feedback.show("failed");
  } finally {
    if (owner === actionSequence && actionOwner.value === "save")
      actionOwner.value = null;
  }
}
const { t } = useI18n();
const blockReasonCopy = (key: string) =>
  key.startsWith("error.") ? t(key) : copy(key);
const confirmation = ref<"leave" | "cancel" | "regenerate" | null>(null);
let leaveResolve: ((value: boolean) => void) | null = null;
function closeConfirmation() {
  if (actionOwner.value === "regenerate") return;
  confirmation.value = null;
  regenerateBinding = null;
  leaveResolve?.(false);
  leaveResolve = null;
}
async function focusConfirmation() {
  if (confirmation.value !== "regenerate") return;
  await nextTick();
  regenerateCancelButton.value?.focus({ preventScroll: true });
}
function ownsRegenerateAction(
  owner: number,
  binding: RegenerateBinding,
): boolean {
  return (
    componentActive &&
    actionOwner.value === "regenerate" &&
    actionSequence === owner &&
    session.epoch.value === binding.sessionEpoch
  );
}
async function confirmRegenerate() {
  const binding = regenerateBinding;
  const snapshot = requestSnapshot();
  if (
    actionOwner.value ||
    confirmation.value !== "regenerate" ||
    !binding ||
    !snapshot ||
    generation.value !== binding.generation ||
    generation.value.runId !== binding.runId ||
    !hasUnsavedResult.value ||
    session.epoch.value !== binding.sessionEpoch
  ) {
    closeConfirmation();
    return;
  }
  const owner = ++actionSequence;
  actionOwner.value = "regenerate";
  try {
    const receipt = await workspace.discard();
    if (
      !ownsRegenerateAction(owner, binding) ||
      !receipt ||
      receipt.runId !== binding.runId ||
      workspace.state.value.generation !== receipt.clearedGeneration
    ) {
      confirmation.value = null;
      regenerateBinding = null;
      return;
    }
  } catch {
    if (ownsRegenerateAction(owner, binding)) {
      regenerateFailure.value = true;
      confirmation.value = null;
      regenerateBinding = null;
    }
    return;
  } finally {
    if (
      owner === actionSequence &&
      actionOwner.value === "regenerate" &&
      (regenerateFailure.value || confirmation.value === null)
    )
      actionOwner.value = null;
  }
  if (!ownsRegenerateAction(owner, binding)) return;
  confirmation.value = null;
  regenerateBinding = null;
  const generationTask = startGeneration(snapshot);
  if (owner === actionSequence && actionOwner.value === "regenerate")
    actionOwner.value = null;
  try {
    await generationTask;
  } finally {
    if (owner === actionSequence && actionOwner.value === "regenerate")
      actionOwner.value = null;
  }
}
async function confirm() {
  const action = confirmation.value;
  if (action === "regenerate") {
    await confirmRegenerate();
    return;
  }
  confirmation.value = null;
  if (action === "cancel") await workspace.cancel();
  if (action === "leave") {
    const resolver = leaveResolve;
    if (actionOwner.value) {
      resolver?.(false);
      if (leaveResolve === resolver) leaveResolve = null;
      return;
    }
    const owner = ++actionSequence;
    const boundGeneration = generation.value;
    const boundRunId = boundGeneration.runId;
    const boundEpoch = session.epoch.value;
    const ownsLeaveAction = () =>
      componentActive &&
      actionOwner.value === "leave" &&
      actionSequence === owner &&
      session.epoch.value === boundEpoch;
    actionOwner.value = "leave";
    try {
      if (generation.value.phase === "streaming") workspace.abortPassive();
      else if (generation.value.phase === "valid") {
        const receipt = await workspace.discard();
        if (
          !ownsLeaveAction() ||
          generation.value === boundGeneration ||
          !receipt ||
          receipt.runId !== boundRunId ||
          generation.value !== receipt.clearedGeneration
        ) {
          resolver?.(false);
          return;
        }
      } else await workspace.discard();
      resolver?.(ownsLeaveAction());
    } catch {
      if (ownsLeaveAction()) {
        feedback.show("failed");
      }
      resolver?.(false);
    } finally {
      if (leaveResolve === resolver) leaveResolve = null;
      if (owner === actionSequence && actionOwner.value === "leave")
        actionOwner.value = null;
    }
  }
}
onBeforeRouteLeave(() => {
  if (allowLeave || !protectLeave.value) return;
  if (actionOwner.value || leaveResolve) return false;
  confirmation.value = "leave";
  return new Promise<boolean>((resolve) => {
    leaveResolve = resolve;
  });
});
function beforeUnload(event: BeforeUnloadEvent) {
  if (protectLeave.value || actionOwner.value) {
    event.preventDefault();
    event.returnValue = "";
  }
}
onMounted(() => window.addEventListener("beforeunload", beforeUnload));
onBeforeUnmount(() => {
  componentActive = false;
  actionSequence++;
  workspace.setVocabularyQuery("");
  workspace.abortPassive();
  window.removeEventListener("beforeunload", beforeUnload);
  leaveResolve?.(false);
});
</script>
<template>
  <div class="page-head">
    <div>
      <h1>{{ locked ? preset?.title : copy("create.title") }}</h1>
      <p>{{ copy(locked ? "preset.desc" : "create.desc") }}</p>
    </div>
    <span v-if="quota" class="pill quota-detail">{{
      copy("b.quota", {
        plan:
          quota.kind === "limited" ? quota.remaining : $t("common.unlimited"),
        extra: extra ?? 0,
      })
    }}</span>
  </div>
  <AppError
    :failure="
      presets.state.value.failure || state.optionsFailure || generation.failure
    "
  />
  <div v-if="!locked || preset" class="workspace">
    <details
      ref="settings"
      class="settings"
      :class="locked ? 'trial-settings' : 'creation-settings'"
      :open="locked"
    >
      <summary>
        <span
          :class="locked ? 'trial-settings-title' : 'creation-settings-title'"
          ><AppIcon :name="locked ? 'lock-keyhole' : 'sparkles'" /><span>{{
            copy(locked ? "trial.config.title" : "config")
          }}</span
          ><span v-if="locked" class="sr-only">{{
            copy("preset.locked")
          }}</span></span
        ><AppIcon
          name="chevron-down"
          :class="
            locked ? 'trial-settings-chevron' : 'creation-settings-chevron'
          "
        />
      </summary>
      <fieldset class="generation-fields" :disabled="interactionLocked">
        <div class="config-fields">
          <GenerationSettings
            v-if="locked && preset"
            :configuration="{
              modelName: preset.configuration.model.name,
              ...preset.configuration,
            }"
          />
          <template v-else
            ><div class="creation-model">
              <label class="field"
                ><span><AppIcon name="bot" />{{ copy("model") }}</span
                ><AppSelect
                  :value="state.modelId ?? ''"
                  :disabled="!options?.models.length"
                  @change="
                    workspace.setModel(
                      ($event.target as HTMLSelectElement).value,
                    )
                  "
                >
                  <option value="">{{ copy("select") }}</option>
                  <option
                    v-for="model in options?.models"
                    :key="model.id"
                    :value="model.id"
                  >
                    {{ model.name }}
                  </option>
                </AppSelect></label
              >
            </div>
            <div class="creation-options">
              <label class="field"
                ><span><AppIcon name="book-open" />{{ copy("style") }}</span
                ><AppSelect
                  :value="state.scenario ?? ''"
                  @change="
                    workspace.setScenario(
                      ($event.target as HTMLSelectElement).value as Scenario,
                    )
                  "
                >
                  <option v-if="!state.scenario" value="">
                    {{ copy("select") }}
                  </option>
                  <option
                    v-for="value in options?.scenarios"
                    :key="value"
                    :value="value"
                  >
                    {{ format.scenario(value) }}
                  </option>
                </AppSelect></label
              >
              <label class="field"
                ><span><AppIcon name="layers" />{{ copy("length") }}</span
                ><AppSelect
                  :value="state.length ?? ''"
                  @change="
                    workspace.setLength(
                      ($event.target as HTMLSelectElement)
                        .value as PassageLength,
                    )
                  "
                >
                  <option value="">{{ copy("select") }}</option>
                  <option
                    v-for="value in options?.lengths"
                    :key="value"
                    :value="value"
                  >
                    {{ format.length(value) }}
                  </option>
                </AppSelect></label
              >
              <label class="field"
                ><span
                  ><AppIcon name="book-open-text" />{{ copy("explain") }}</span
                ><AppSelect
                  :value="state.meaningLanguage ?? ''"
                  @change="
                    workspace.setMeaningLanguage(
                      ($event.target as HTMLSelectElement)
                        .value as MeaningLanguage,
                    )
                  "
                >
                  <option value="">{{ copy("select") }}</option>
                  <option
                    v-for="value in options?.meaningLanguages"
                    :key="value"
                    :value="value"
                  >
                    {{ format.meaning(value) }}
                  </option>
                </AppSelect></label
              >
            </div>
          </template>
        </div>
      </fieldset>
    </details>
    <div>
      <section class="panel">
        <WordPicker
          v-if="!locked"
          id="create-words"
          :selected-entries="words"
          :candidates="state.candidates"
          :query="state.query"
          :search-status="state.searchStatus"
          :disabled="interactionLocked"
          :max-entries="options?.maxEntries ?? 0"
          :random-pending="state.randomPending"
          show-random
          @query="workspace.setVocabularyQuery"
          @add="workspace.addEntry"
          @remove="workspace.removeEntry"
          @retry="workspace.searchVocabulary(state.query)"
          @random="workspace.randomEntry"
        />
        <template v-else
          ><div class="section-head">
            <h2>{{ copy("words") }}</h2>
            <span class="pill">{{ copy("preset.locked") }}</span>
          </div>
          <div class="chips">
            <span v-for="word in words" :key="word" class="chip">{{
              word
            }}</span>
          </div></template
        >
        <p v-if="locked && !detail?.canStart" class="note warn">
          {{ copy("preset.invaliddesc") }}
        </p>
        <p
          v-else-if="
            options && !options.availability.canGenerate && !interactionLocked
          "
          class="note warn"
        >
          {{
            blockReasonCopy(
              options.availability.reason === "credential_missing"
                ? "error.generation_unavailable"
                : options.availability.reason === "generation_in_progress"
                  ? "error.generation_in_progress"
                  : options.availability.reason === "no_models"
                    ? "nomodel.desc"
                    : options.availability.reason === "no_lengths"
                      ? "l.nolength"
                      : "noquota.desc",
            )
          }}
        </p>
        <p
          v-if="regenerateFailure"
          class="notice error m003-regenerate-error"
          role="alert"
        >
          {{ copy("m003.regenerate.failure") }}
        </p>
        <div id="generation-actions" class="actions">
          <button
            ref="generateButton"
            class="btn primary"
            :disabled="
              actionOwner !== null ||
              generation.phase === 'pending' ||
              (generation.phase !== 'streaming' &&
                !(locked ? detail?.canStart : workspace.canSubmit.value))
            "
            @click="
              generation.phase === 'streaming'
                ? (confirmation = 'cancel')
                : generate()
            "
            @focus="rememberGenerateFocus"
            @blur="releaseGenerateFocus"
          >
            <AppIcon
              v-if="generation.phase !== 'streaming'"
              name="sparkles"
            />{{
              copy(generation.phase === "streaming" ? "cancelgen" : "start")
            }}
          </button>
        </div>
      </section>
      <section
        id="generation-status"
        tabindex="-1"
        class="panel generation-result m003-generation-paper"
        data-region="generation-result"
      >
        <div class="m003-result-body">
          <div
            v-if="
              ['streaming', 'pending'].includes(generation.phase) ||
              generation.resultUnavailable ||
              (generation.result &&
                ['valid', 'saved'].includes(generation.phase))
            "
          >
            <GenerationContent
              :draft="generation.draft"
              :plan-items="generation.planItems"
              :result="generation.result"
              :phase="generation.phase"
              :request-phase="generation.requestPhase"
              :activity="generation.activity"
              :completion-notice="generation.completionNotice"
              :pronunciation-enabled="!locked"
            />
            <p
              v-if="
                generation.phase === 'pending' || generation.resultUnavailable
              "
              class="notice warn"
            >
              {{ copy("m003.pending.body") }}
            </p>
            <button
              v-if="
                generation.phase === 'pending' || generation.resultUnavailable
              "
              class="btn"
              @click="workspace.recheck"
            >
              {{ copy("m003.recheck") }}
            </button>
            <div class="actions">
              <button
                v-if="generation.result && generation.phase === 'valid'"
                class="btn primary"
                :disabled="interactionLocked"
                @click="save"
              >
                {{ copy(session.isLearner.value ? "collect" : "guestcollect") }}
              </button>
            </div>
          </div>
          <div v-else class="empty">
            <h2>
              {{
                copy(
                  generation.phase === "cancelled"
                    ? "create.cancelled"
                    : generation.phase === "failed"
                      ? "error"
                      : "create.empty",
                )
              }}
            </h2>
            <p v-if="generation.phase === 'idle'">
              {{ copy("create.emptydesc") }}
            </p>
            <button
              v-if="generation.phase === 'failed'"
              class="btn primary"
              @click="generate"
            >
              {{ copy("retry") }}
            </button>
          </div>
        </div>
      </section>
    </div>
  </div>
  <NuxtLink v-else class="btn" to="/explore">{{ copy("explore") }}</NuxtLink>
  <AppDialog
    :id="
      confirmation === 'regenerate'
        ? 'regenerate-confirm'
        : 'generation-confirm'
    "
    :open="confirmation !== null"
    :return-focus="() => generateButton"
    :title="
      copy(
        confirmation === 'regenerate'
          ? 'm003.regenerate.title'
          : 'l.leave.title',
      )
    "
    @close="closeConfirmation"
    @shown="focusConfirmation"
    ><p>
      {{
        copy(
          confirmation === "regenerate"
            ? "m003.regenerate.body"
            : "l.leave.desc",
        )
      }}
    </p>
    <template #footer
      ><button
        ref="regenerateCancelButton"
        class="btn"
        :disabled="actionOwner === 'regenerate'"
        @click="closeConfirmation"
      >
        {{ copy("cancel") }}</button
      ><button
        class="btn"
        :class="confirmation === 'regenerate' ? 'danger' : 'primary'"
        :disabled="actionOwner === 'regenerate'"
        @click="confirm"
      >
        {{
          copy(
            confirmation === "regenerate"
              ? "m003.regenerate.confirm"
              : "confirm",
          )
        }}
      </button></template
    ></AppDialog
  >
</template>
