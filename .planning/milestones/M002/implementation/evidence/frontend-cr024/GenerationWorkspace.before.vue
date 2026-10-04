<script setup lang="ts">
import type {
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
const busy = computed(() =>
  ["streaming", "valid"].includes(generation.value.phase),
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
const search = ref(""),
  searchOpen = ref(false),
  saving = ref(false);
let searchTimer: ReturnType<typeof setTimeout> | undefined,
  allowLeave = false;
workspace.startNewTask();
await usePageLoader(`generation:${props.presetId ?? "ordinary"}`, () =>
  props.presetId ? presets.detail(props.presetId) : workspace.loadOptions(true),
);
onMounted(() => {
  if (settings.value) settings.value.open = locked.value || innerWidth > 1100;
});
function query() {
  clearTimeout(searchTimer);
  searchOpen.value = true;
  searchTimer = setTimeout(
    () => void workspace.searchVocabulary(search.value),
    180,
  );
}
function choose(entry: string) {
  workspace.addEntry(entry);
  search.value = "";
  searchOpen.value = false;
}
async function generate() {
  const selected = preset.value;
  const ok = await workspace.generate(
    locked.value && selected
      ? {
          kind: "preset",
          presetId: selected.id,
          publishedVersion: selected.publishedVersion,
        }
      : undefined,
  );
  if (locked.value && props.presetId && !ok)
    await presets.detail(props.presetId);
  else if (!locked.value) await workspace.loadOptions(true);
}
async function save() {
  if (saving.value) return;
  saving.value = true;
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
    saving.value = false;
  }
}
const { t } = useI18n();
const blockReasonCopy = (key: string) =>
  key.startsWith("error.") ? t(key) : copy(key);
const confirmation = ref<"leave" | "cancel" | "discard" | null>(null);
let leaveResolve: ((value: boolean) => void) | null = null;
function closeConfirmation() {
  confirmation.value = null;
  leaveResolve?.(false);
  leaveResolve = null;
}
async function confirm() {
  const action = confirmation.value;
  confirmation.value = null;
  if (action === "cancel") await workspace.cancel();
  if (action === "discard") await workspace.discard();
  if (action === "leave") {
    if (generation.value.phase === "streaming") workspace.abortPassive();
    else await workspace.discard();
    leaveResolve?.(true);
    leaveResolve = null;
  }
}
onBeforeRouteLeave(() => {
  if (allowLeave || !busy.value) return;
  confirmation.value = "leave";
  return new Promise<boolean>((resolve) => {
    leaveResolve = resolve;
  });
});
function beforeUnload(event: BeforeUnloadEvent) {
  if (busy.value) {
    event.preventDefault();
    event.returnValue = "";
  }
}
onMounted(() => window.addEventListener("beforeunload", beforeUnload));
onBeforeUnmount(() => {
  clearTimeout(searchTimer);
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
      <fieldset class="generation-fields" :disabled="busy">
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
                ><select
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
                </select></label
              >
            </div>
            <div class="creation-options">
              <label class="field"
                ><span><AppIcon name="book-open" />{{ copy("style") }}</span
                ><select
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
                </select></label
              >
              <label class="field"
                ><span><AppIcon name="layers" />{{ copy("length") }}</span
                ><select
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
                </select></label
              >
              <label class="field"
                ><span
                  ><AppIcon name="book-open-text" />{{ copy("explain") }}</span
                ><select
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
                </select></label
              >
            </div>
          </template>
        </div>
      </fieldset>
    </details>
    <div>
      <section class="panel">
        <div class="section-head">
          <div>
            <h2>{{ copy("words") }}</h2>
            <small>{{
              copy("wordcount", {
                count: words.length,
                limit: locked ? words.length : (options?.maxEntries ?? 0),
              })
            }}</small>
          </div>
          <span v-if="locked" class="pill">{{ copy("preset.locked") }}</span
          ><button
            v-else
            class="btn small"
            :disabled="busy || state.randomPending || !options"
            @click="workspace.randomEntry"
          >
            <AppIcon name="shuffle" />{{ copy("random") }}
          </button>
        </div>
        <div class="chips">
          <span v-for="word in words" :key="word" class="chip"
            >{{ word
            }}<button
              v-if="!locked"
              class="btn quiet small"
              :disabled="busy"
              :aria-label="`${copy('remove')} ${word}`"
              @click="workspace.removeEntry(word)"
            >
              <AppIcon name="x" /></button
          ></span>
        </div>
        <fieldset v-if="!locked" class="generation-fields" :disabled="busy">
          <div class="form-actions">
            <label class="field"
              ><span>{{ copy("wordsearch") }}</span
              ><input
                v-model="search"
                autocomplete="off"
                role="combobox"
                aria-controls="word-results"
                :aria-expanded="searchOpen"
                @input="query"
                @keydown.esc="searchOpen = false" /></label
            ><button
              class="btn"
              :disabled="!state.candidates.includes(search)"
              @click="choose(search)"
            >
              {{ copy("add") }}
            </button>
          </div>
          <ul
            v-if="searchOpen"
            id="word-results"
            class="word-results"
            role="listbox"
          >
            <li v-for="entry in state.candidates" :key="entry">
              <button
                class="btn quiet"
                role="option"
                :aria-selected="false"
                @click="choose(entry)"
              >
                {{ entry }}
              </button>
            </li>
            <li v-if="state.searchStatus === 'loading'">
              {{ copy("loading") }}
            </li>
            <li v-if="state.searchStatus === 'failed'">
              <button class="btn" @click="query">{{ copy("retry") }}</button>
            </li>
          </ul>
        </fieldset>
        <p v-if="locked && !detail?.canStart" class="note warn">
          {{ copy("preset.invaliddesc") }}
        </p>
        <p
          v-else-if="options && !options.availability.canGenerate && !busy"
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
        <div class="actions">
          <button
            class="btn primary"
            :disabled="
              busy || !(locked ? detail?.canStart : workspace.canSubmit.value)
            "
            @click="generate"
          >
            <AppIcon name="sparkles" />{{ copy("start") }}
          </button>
        </div>
      </section>
      <section class="panel generation-result" data-region="generation-result">
        <div v-if="generation.phase === 'streaming'" class="article">
          <p class="eyebrow">{{ copy("create.generating") }}</p>
          <p class="story-text" aria-live="polite">
            {{ generation.streamedText }}
          </p>
          <button class="btn" @click="confirmation = 'cancel'">
            {{ copy("cancelgen") }}
          </button>
        </div>
        <div
          v-else-if="
            generation.result && ['valid', 'saved'].includes(generation.phase)
          "
          class="article"
        >
          <p class="eyebrow">{{ copy("create.done") }}</p>
          <h2>{{ words.join(" · ") }}</h2>
          <p class="story-text">
            <template
              v-for="(segment, index) in generation.result.passageSegments"
              :key="index"
              ><mark v-if="segment.kind === 'target'">{{ segment.text }}</mark
              ><template v-else>{{ segment.text }}</template></template
            >
          </p>
          <div class="chips">
            <span
              v-for="tag in generation.result.tags"
              :key="tag"
              class="chip"
              >{{ tag }}</span
            >
          </div>
          <div class="resource-grid">
            <article
              v-for="target in generation.result.targets"
              :key="target.entry"
              class="resource-card"
            >
              <h3>{{ target.entry }}</h3>
              <p>{{ target.entryMeaning }}</p>
              <p>{{ target.hintPhrase }}</p>
            </article>
          </div>
          <div class="actions">
            <button class="btn primary" :disabled="saving" @click="save">
              {{
                copy(session.isLearner.value ? "collect" : "guestcollect")
              }}</button
            ><button
              class="btn quiet"
              :disabled="saving"
              @click="confirmation = 'discard'"
            >
              {{ copy("l.discard") }}
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
      </section>
    </div>
  </div>
  <NuxtLink v-else class="btn" to="/explore">{{ copy("explore") }}</NuxtLink>
  <AppDialog
    id="generation-confirm"
    :open="confirmation !== null"
    :title="
      copy(confirmation === 'discard' ? 'l.discard.title' : 'l.leave.title')
    "
    @close="closeConfirmation"
    ><p>
      {{ copy(confirmation === "discard" ? "l.discard.desc" : "l.leave.desc") }}
    </p>
    <template #footer
      ><button class="btn" @click="closeConfirmation">
        {{ copy("cancel") }}</button
      ><button class="btn primary" @click="confirm">
        {{ copy("confirm") }}
      </button></template
    ></AppDialog
  >
</template>
