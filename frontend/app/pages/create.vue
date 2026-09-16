<script setup lang="ts">
import type {
  MeaningLanguage,
  PassageLength,
  Scenario,
} from "@application/shared/models";

const workspace = useGenerationStore();
const session = useSessionStore();
const format = useDisplayFormatters();
const searchOpen = ref(false);
let searchTimer: ReturnType<typeof setTimeout> | null = null;
let allowProtectedLeave = false;
const options = computed(() => workspace.state.value.options);
const quotaPercent = computed(() => {
  const quota = options.value?.quota;
  if (!quota || quota.kind === "unlimited") return 100;
  return quota.limit > 0
    ? Math.round((quota.remaining / quota.limit) * 100)
    : 0;
});
const selectedModel = computed(() =>
  options.value?.models.find(
    (model) => model.id === workspace.state.value.modelId,
  ),
);
const hasReadingStyle = computed(
  () =>
    Boolean(workspace.state.value.modelId) &&
    Boolean(workspace.state.value.meaningLanguage) &&
    Boolean(workspace.state.value.scenario) &&
    Boolean(workspace.state.value.length),
);
const resultSummary = computed(() => {
  const scenario = workspace.state.value.scenario;
  const length = workspace.state.value.length;
  const language = workspace.state.value.meaningLanguage;
  if (!scenario || !length || !language) return "";
  return String(
    useNuxtApp().$i18n.t("create.summary", {
      scenario: format.scenario(scenario),
      length: format.length(length),
      language: format.meaning(language),
      model: selectedModel.value?.name ?? "",
    }),
  );
});

workspace.startNewTask();
await usePageLoader("generation-options", () => workspace.loadOptions());
useLocalizedHead("common.create");

onBeforeRouteLeave(async () => {
  if (allowProtectedLeave) return;
  const phase = workspace.state.value.generation.phase;
  if (phase !== "streaming" && phase !== "valid") return;
  if (!window.confirm(String(useNuxtApp().$i18n.t("create.discardConfirm"))))
    return false;
  if (phase === "streaming") workspace.abortPassive();
  else await workspace.discard();
});

function protectBeforeUnload(event: BeforeUnloadEvent) {
  const phase = workspace.state.value.generation.phase;
  if (phase !== "streaming" && phase !== "valid") return;
  event.preventDefault();
  event.returnValue = "";
}

onMounted(() => window.addEventListener("beforeunload", protectBeforeUnload));

onBeforeUnmount(() => {
  window.removeEventListener("beforeunload", protectBeforeUnload);
  workspace.abortPassive();
});

function onQuery(event: Event) {
  const query = (event.target as HTMLInputElement).value;
  searchOpen.value = true;
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    void workspace.searchVocabulary(query);
  }, 180);
}

function choose(entry: string) {
  workspace.addEntry(entry);
  searchOpen.value = false;
}

async function generate() {
  await workspace.generate();
}

async function stop() {
  if (window.confirm(String(useNuxtApp().$i18n.t("create.discardConfirm"))))
    await workspace.cancel();
}

async function save() {
  try {
    const outcome = await workspace.save();
    if (outcome.kind === "saved") {
      await navigateTo(`/library/${encodeURIComponent(outcome.batchId)}`);
    } else {
      allowProtectedLeave = true;
      await navigateTo({
        path: "/login",
        query: { claim: "1", redirect: "/library" },
      });
    }
  } catch {
    // Failure is represented by the store or subsequent session refresh.
  }
}

async function another() {
  if (
    workspace.state.value.generation.phase === "valid" &&
    !window.confirm(String(useNuxtApp().$i18n.t("create.discardConfirm")))
  )
    return;
  await workspace.discard();
  workspace.startNewTask();
  searchOpen.value = false;
}
</script>

<template>
  <div class="container page-section">
    <header class="page-heading">
      <div>
        <p class="eyebrow">{{ $t("create.eyebrow") }}</p>
        <h1 class="page-title">{{ $t("create.title") }}</h1>
        <p class="page-description">{{ $t("create.description") }}</p>
      </div>
      <span
        v-if="workspace.state.value.options?.quota.kind === 'limited'"
        class="quota-pill"
        ><AppIcon name="clock" />{{
          $t("create.quotaLeft", {
            count: workspace.state.value.options.quota.remaining,
          })
        }}</span
      >
      <span v-else-if="workspace.state.value.options" class="quota-pill"
        ><AppIcon name="clock" />{{ $t("common.unlimited") }}</span
      >
    </header>

    <AppError
      :failure="
        workspace.state.value.optionsFailure ||
        workspace.state.value.generation.failure
      "
    />
    <div class="studio-grid">
      <aside
        class="studio-sidebar card"
        :aria-label="$t('create.configuration')"
      >
        <div class="card-body">
          <section class="config-section">
            <div class="section-label">
              <span class="section-index">1</span>{{ $t("create.words")
              }}<span class="field-meta"
                >{{ workspace.state.value.selectedEntries.length }} /
                {{ options?.maxEntries ?? 0 }}</span
              >
            </div>
            <div class="word-search-shell">
              <div class="input-with-icon">
                <AppIcon name="search" />
                <input
                  id="word-search"
                  class="text-input"
                  :value="workspace.state.value.query"
                  :placeholder="$t('create.wordPlaceholder')"
                  autocomplete="off"
                  role="combobox"
                  aria-autocomplete="list"
                  :aria-expanded="
                    searchOpen && workspace.state.value.searchStatus !== 'idle'
                  "
                  :aria-controls="
                    searchOpen ? 'word-search-results' : undefined
                  "
                  @input="onQuery"
                  @focus="searchOpen = true"
                  @keydown.esc="searchOpen = false"
                />
              </div>
              <ul
                v-if="
                  searchOpen && workspace.state.value.searchStatus !== 'idle'
                "
                id="word-search-results"
                class="search-results word-search-overlay"
                :aria-label="$t('create.wordResults')"
                role="listbox"
              >
                <li
                  v-if="workspace.state.value.searchStatus === 'loading'"
                  class="helper search-result-message"
                >
                  {{ $t("common.loading") }}
                </li>
                <li
                  v-for="entry in workspace.state.value.candidates"
                  :key="entry"
                >
                  <button
                    class="search-result"
                    type="button"
                    role="option"
                    @click="choose(entry)"
                  >
                    <span>{{ entry }}</span
                    ><span aria-hidden="true">＋</span>
                  </button>
                </li>
                <li
                  v-if="workspace.state.value.searchStatus === 'empty'"
                  class="helper search-result-message"
                >
                  {{ $t("create.noWords") }}
                </li>
              </ul>
            </div>
            <div class="chip-list studio-chip-list">
              <span
                v-for="entry in workspace.state.value.selectedEntries"
                :key="entry"
                class="chip"
                >{{ entry
                }}<button
                  class="chip-remove"
                  type="button"
                  :aria-label="$t('create.removeWord', { word: entry })"
                  @click="workspace.removeEntry(entry)"
                >
                  ×
                </button></span
              >
            </div>
          </section>

          <section class="config-section">
            <div class="section-label">
              <span class="section-index">2</span>{{ $t("create.preferences") }}
            </div>
            <div class="field">
              <span class="field-label">{{ $t("create.model") }}</span>
              <div class="choice-grid choice-grid-model">
                <button
                  v-for="model in workspace.state.value.options?.models"
                  :key="model.id"
                  class="choice"
                  :aria-pressed="workspace.state.value.modelId === model.id"
                  type="button"
                  @click="workspace.setModel(model.id)"
                >
                  <span class="choice-title">{{ model.name }}</span
                  ><span v-if="model.description" class="choice-description">{{
                    model.description
                  }}</span>
                </button>
              </div>
            </div>

            <div class="field">
              <span class="field-label">{{
                $t("create.meaningLanguage")
              }}</span>
              <div class="choice-grid choice-grid-3 choice-grid-compact">
                <button
                  v-for="value in workspace.state.value.options
                    ?.meaningLanguages"
                  :key="value"
                  class="choice"
                  :aria-pressed="
                    workspace.state.value.meaningLanguage === value
                  "
                  type="button"
                  @click="
                    workspace.setMeaningLanguage(value as MeaningLanguage)
                  "
                >
                  <span class="choice-title">{{ format.meaning(value) }}</span
                  ><span class="choice-description">{{
                    format.meaningDescription(value)
                  }}</span>
                </button>
              </div>
            </div>

            <div class="field">
              <span class="field-label">{{ $t("create.scenario") }}</span>
              <div class="choice-grid choice-grid-scenario choice-grid-compact">
                <button
                  v-for="value in workspace.state.value.options?.scenarios"
                  :key="value"
                  class="choice"
                  :aria-pressed="workspace.state.value.scenario === value"
                  type="button"
                  @click="workspace.setScenario(value as Scenario)"
                >
                  <span class="choice-title">{{ format.scenario(value) }}</span
                  ><span class="choice-description">{{
                    format.scenarioDescription(value)
                  }}</span>
                </button>
              </div>
            </div>
          </section>

          <div class="field">
            <span class="field-label">{{ $t("create.length") }}</span>
            <div class="choice-grid choice-grid-4 choice-grid-compact">
              <button
                v-for="value in workspace.state.value.options?.lengths"
                :key="value"
                class="choice"
                :aria-pressed="workspace.state.value.length === value"
                type="button"
                @click="workspace.setLength(value as PassageLength)"
              >
                <span class="choice-title">{{ format.length(value) }}</span>
              </button>
            </div>
          </div>
          <div v-if="options" class="quota-line">
            <span>{{ $t("create.available") }}</span
            ><span
              class="meter"
              role="progressbar"
              :aria-label="
                options.quota.kind === 'limited'
                  ? $t('create.quotaLeft', { count: options.quota.remaining })
                  : $t('common.unlimited')
              "
              :aria-valuemin="0"
              :aria-valuemax="
                options.quota.kind === 'limited' ? options.quota.limit : 1
              "
              :aria-valuenow="
                options.quota.kind === 'limited' ? options.quota.remaining : 1
              "
              ><span :style="{ width: `${quotaPercent}%` }" /></span
            ><strong>{{
              options.quota.kind === "limited" ? options.quota.remaining : "∞"
            }}</strong>
          </div>
          <div class="generate-bar">
            <button
              class="button button-primary"
              type="button"
              :disabled="
                !workspace.canSubmit.value ||
                workspace.state.value.generation.phase === 'streaming'
              "
              @click="generate"
            >
              <AppIcon name="spark" />{{
                workspace.state.value.generation.phase === "streaming"
                  ? $t("create.generating")
                  : $t("create.generate")
              }}
            </button>
          </div>
        </div>
      </aside>

      <article
        class="output-canvas card"
        :aria-label="$t('create.result')"
        aria-live="polite"
      >
        <div
          v-if="
            workspace.state.value.generation.phase === 'idle' ||
            workspace.state.value.generation.phase === 'cancelled' ||
            workspace.state.value.generation.phase === 'discarded' ||
            workspace.state.value.generation.phase === 'failed'
          "
          class="output-empty"
        >
          <span class="output-empty-mark" aria-hidden="true" />
          <h2>
            {{
              hasReadingStyle && workspace.state.value.selectedEntries.length
                ? $t("create.readySelected")
                : $t("create.ready")
            }}
          </h2>
          <p>
            {{
              hasReadingStyle && workspace.state.value.selectedEntries.length
                ? $t("create.readySelectedCopy")
                : $t("create.readyCopy")
            }}
          </p>
        </div>
        <template v-else>
          <div class="output-header">
            <span
              v-if="workspace.state.value.generation.phase === 'streaming'"
              class="stream-status"
              ><span class="spinner" aria-hidden="true" />{{
                $t("create.generating")
              }}</span
            >
            <span v-else class="status-badge status-success">{{
              $t("create.complete")
            }}</span>
            <button
              v-if="workspace.state.value.generation.phase === 'streaming'"
              class="button button-danger-quiet button-small"
              type="button"
              @click="stop"
            >
              {{ $t("create.stop") }}
            </button>
            <span
              v-else-if="workspace.state.value.generation.result"
              class="helper"
              >{{ resultSummary }}</span
            >
          </div>
          <div
            v-if="workspace.state.value.generation.phase === 'streaming'"
            class="notice notice-warning output-stream-notice"
          >
            <AppIcon name="alert" />
            <div>{{ $t("create.stayHere") }}</div>
          </div>
          <div class="output-content">
            <p
              v-if="workspace.state.value.generation.phase === 'streaming'"
              class="reading-passage stream-passage streaming-caret"
            >
              {{ workspace.state.value.generation.streamedText }}
            </p>
            <template v-if="workspace.state.value.generation.result">
              <div class="passage-tags">
                <span class="passage-tags-label">{{ $t("create.tags") }}</span>
                <div class="chip-list">
                  <span
                    v-for="tag in workspace.state.value.generation.result.tags"
                    :key="tag"
                    class="tag tag-passage"
                    >{{ tag }}</span
                  >
                </div>
              </div>
              <p class="reading-passage">
                <template
                  v-for="(segment, index) in workspace.state.value.generation
                    .result.passageSegments"
                  :key="index"
                  ><mark v-if="segment.kind === 'target'" class="target-word">{{
                    segment.text
                  }}</mark
                  ><template v-else>{{ segment.text }}</template></template
                >
              </p>
              <section class="resource-section">
                <div class="card-header resource-heading">
                  <div>
                    <h2 class="card-title">{{ $t("create.targets") }}</h2>
                    <p class="card-subtitle">{{ $t("create.targetsCopy") }}</p>
                  </div>
                </div>
                <div class="resource-grid">
                  <article
                    v-for="target in workspace.state.value.generation.result
                      .targets"
                    :key="target.entry"
                    class="resource-card"
                  >
                    <h3 class="resource-word">{{ target.entry }}</h3>
                    <p class="resource-meaning">
                      {{ target.entryMeaning }}
                    </p>
                    <p class="resource-phrase">
                      “<template
                        v-for="(segment, index) in target.hintSegments"
                        :key="index"
                        >{{ segment.text }}</template
                      >”
                    </p>
                  </article>
                </div>
              </section>
            </template>
          </div>
          <div
            v-if="
              workspace.state.value.generation.phase === 'valid' ||
              workspace.state.value.generation.phase === 'saved'
            "
            class="result-action-bar"
          >
            <button
              class="button button-secondary"
              type="button"
              @click="another"
            >
              {{ $t("create.another") }}
            </button>
            <button
              v-if="workspace.state.value.generation.phase === 'valid'"
              class="button button-primary"
              type="button"
              @click="save"
            >
              {{
                session.isLearner.value
                  ? $t("create.save")
                  : $t("create.signInToSave")
              }}
            </button>
            <span v-else class="notice notice-success">{{
              $t("create.saved")
            }}</span>
          </div>
        </template>
      </article>
    </div>
  </div>
</template>
