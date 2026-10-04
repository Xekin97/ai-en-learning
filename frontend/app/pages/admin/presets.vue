<script setup lang="ts">
import type { DeepReadonly } from "vue";
import { useAdminPresetsStore } from "@runtime/stores/admin-presets";
import { mergeEdited } from "@application/admin/growth-drafts";
import { normalizeFailure } from "@application/shared/failure";
import type {
  AdminPresetModel,
  AdminPresetRecord,
  PresetInputModel,
} from "@application/admin/presets";
import type {
  AppFailure,
  MeaningLanguage,
  Scenario,
  PassageLength,
} from "@application/shared/models";
definePageMeta({ middleware: "admin", layout: "admin" });
const store = useAdminPresetsStore(),
  session = useSessionStore(),
  { copy } = useDesignCopy(),
  format = useDisplayFormatters();
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
type Fields = {
  title: string;
  words: string[];
  modelId: string;
  meaningLanguage: MeaningLanguage | "";
  scenario: Scenario;
  length: PassageLength;
};
type Draft = {
  id: string | null;
  baseline: Fields;
  value: Fields;
  revision: string | null;
  record: AdminPresetModel | null;
  remote: AdminPresetRecord | null;
  failure: AppFailure | null;
  reconciling: boolean;
  unknownCreate: boolean;
  lastPreview: {
    result: NonNullable<AdminPresetModel["preview"]>["result"];
    configuration: AdminPresetModel["configuration"];
  } | null;
};
const vocabulary = useVocabularySearch();
const selected = ref("new"),
  drafts = ref<Record<string, Draft>>({}),
  action = ref<"publish" | "unlist" | "leave" | "discard" | null>(null),
  pending = ref(false),
  invalid = ref(false);
const blank = (): Fields => ({
  title: "",
  words: [],
  modelId: "",
  meaningLanguage: "",
  scenario: "story",
  length: "short",
});
const fields = (p: AdminPresetModel): Fields => ({
  title: p.title,
  words: [...p.configuration.entries],
  modelId: p.configuration.model.id,
  meaningLanguage: p.configuration.meaningLanguage,
  scenario: p.configuration.scenario,
  length: p.configuration.length,
});
function from(
  record: DeepReadonly<AdminPresetRecord>,
  previous: Draft["lastPreview"] = null,
): Draft {
  const f = fields(clone(record.preset) as AdminPresetModel);
  return {
    lastPreview: record.preset.preview
      ? {
          result: clone(record.preset.preview.result) as NonNullable<
            AdminPresetModel["preview"]
          >["result"],
          configuration: clone(
            record.preset.configuration,
          ) as AdminPresetModel["configuration"],
        }
      : previous,
    id: record.preset.id,
    baseline: clone(f),
    value: f,
    revision: record.revision,
    record: clone(record.preset) as AdminPresetModel,
    remote: null,
    failure: null,
    reconciling: false,
    unknownCreate: false,
  };
}
function ensureNew() {
  if (!drafts.value.new) {
    const value = blank();
    drafts.value.new = {
      lastPreview: null,
      id: null,
      baseline: clone(value),
      value,
      revision: null,
      record: null,
      remote: null,
      failure: null,
      reconciling: false,
      unknownCreate: false,
    };
  }
}
await usePageLoader("admin-presets", () =>
  Promise.allSettled([store.load(), store.readOptions()]).then(() => {}),
);
for (const p of store.state.value.items)
  drafts.value[p.id] = from({
    preset: clone(p),
    revision: store.state.value.revision!,
  });
ensureNew();
if (store.state.value.items[0]) selected.value = store.state.value.items[0].id;
const draft = computed(() => drafts.value[selected.value]!);
watch(selected, () => vocabulary.reset(), { flush: "sync" });
function addWord(word: string) {
  if (
    busy.value ||
    draft.value.reconciling ||
    draft.value.unknownCreate ||
    vocabulary.state.value.searchStatus !== "ready" ||
    !vocabulary.state.value.candidates.includes(word) ||
    draft.value.value.words.some((w) => w.toLowerCase() === word.toLowerCase())
  )
    return;
  draft.value.value.words.push(word);
  vocabulary.reset();
}
function removeWord(word: string) {
  if (!busy.value && !draft.value.reconciling && !draft.value.unknownCreate)
    draft.value.value.words = draft.value.value.words.filter((w) => w !== word);
}
const previewStale = computed(() => {
  const d = draft.value,
    previous = d?.lastPreview;
  if (!previous) return true;
  const c = previous.configuration,
    v = d.value;
  return (
    JSON.stringify(v.words) !== JSON.stringify(c.entries) ||
    v.modelId !== c.model.id ||
    v.meaningLanguage !== c.meaningLanguage ||
    v.scenario !== c.scenario ||
    v.length !== c.length ||
    d.record?.draftState === "needs_preview"
  );
});
const streaming = computed(() =>
  ["starting", "streaming"].includes(store.stream.value.phase),
);
const busy = computed(
  () => pending.value || store.busy.value || streaming.value,
);
const dirty = computed(
  () =>
    JSON.stringify(draft.value?.value) !==
    JSON.stringify(draft.value?.baseline),
);
const options = computed(() => store.state.value.options);
const ready = computed(
  () =>
    !store.state.value.optionsFailure &&
    options.value?.availability.kind === "ready",
);
const modelExists = computed(
  () =>
    options.value?.models.some((m) => m.id === draft.value?.value.modelId) ??
    false,
);
const publishable = computed(
  () =>
    !busy.value &&
    !dirty.value &&
    !draft.value?.remote &&
    !draft.value?.reconciling &&
    modelExists.value &&
    draft.value?.record?.draftState === "preview_ready",
);
function state(
  p: Pick<AdminPresetModel, "listed" | "hasUnpublishedChanges" | "draftState">,
) {
  return p.listed
    ? p.hasUnpublishedChanges
      ? "changed"
      : "published"
    : p.draftState === "preview_ready"
      ? "previewed"
      : "draft";
}
const phase = computed(() =>
  store.stream.value.presetId === draft.value?.id &&
  ["starting", "streaming", "failed", "cancelled"].includes(
    store.stream.value.phase,
  )
    ? streaming.value
      ? "running"
      : store.stream.value.phase
    : dirty.value
      ? "changed"
      : draft.value?.record
        ? state(draft.value.record)
        : "draft",
);
function select(id: string) {
  if (busy.value) return;
  if (!drafts.value[id]) {
    const p = store.state.value.items.find((p) => p.id === id);
    if (p)
      drafts.value[id] = from({
        preset: clone(p),
        revision: store.state.value.revision!,
      });
  }
  selected.value = id;
  invalid.value = false;
  store.dispose();
}
function newPreset() {
  if (busy.value) return;
  ensureNew();
  select("new");
}
function input(): PresetInputModel | null {
  const d = draft.value.value,
    entries = [...d.words];
  invalid.value =
    !d.title.trim() ||
    [...d.title.trim()].length > 200 ||
    !entries.length ||
    new Set(entries.map((e) => e.toLocaleLowerCase())).size !==
      entries.length ||
    !d.meaningLanguage ||
    !modelExists.value;
  if (invalid.value || !d.meaningLanguage) return null;
  return {
    title: d.title.trim(),
    configuration: {
      modelId: d.modelId,
      entries,
      meaningLanguage: d.meaningLanguage,
      scenario: d.scenario,
      length: d.length,
    },
  };
}
async function reconcile(d: Draft) {
  const epoch = session.epoch.value;
  d.reconciling = true;
  try {
    if (d.id) {
      const fresh = await store.read(d.id);
      if (epoch !== session.epoch.value) return;
      if (fresh) d.remote = fresh;
    } else await store.load();
    if (epoch === session.epoch.value) d.reconciling = false;
  } catch (error) {
    if (epoch === session.epoch.value) d.failure = normalizeFailure(error);
  }
}
async function failed(d: Draft, error: unknown, write = false) {
  d.failure = normalizeFailure(error);
  if (
    d.failure.status === 409 ||
    d.failure.status === null ||
    (d.failure.status ?? 0) >= 500
  ) {
    if (write && !d.id && d.failure.status !== 409) d.unknownCreate = true;
    await reconcile(d);
  }
  await store.readOptions();
}
function applied(record: AdminPresetRecord, key: string) {
  const previous = drafts.value[key]?.lastPreview;
  Reflect.deleteProperty(drafts.value, key);
  drafts.value[record.preset.id] = from(record, previous);
  selected.value = record.preset.id;
}
async function save() {
  if (busy.value || draft.value.reconciling || draft.value.unknownCreate)
    return false;
  const key = selected.value,
    d = draft.value,
    epoch = session.epoch.value;
  if (d.remote) {
    d.value = mergeEdited(d.baseline, clone(d.value), fields(d.remote.preset));
    d.baseline = fields(d.remote.preset);
    d.record = clone(d.remote.preset);
    d.revision = d.remote.revision;
    d.remote = null;
  }
  const value = input();
  if (!value) return false;
  pending.value = true;
  d.failure = null;
  try {
    const record = await store.save(
      value,
      d.id ?? undefined,
      d.revision ?? undefined,
    );
    if (epoch !== session.epoch.value) return false;
    if (record) {
      applied(record, key);
      return true;
    }
    return false;
  } catch (error) {
    if (epoch === session.epoch.value) await failed(d, error, true);
    return false;
  } finally {
    if (epoch === session.epoch.value) pending.value = false;
  }
}
async function preview() {
  if (busy.value || !ready.value || !modelExists.value) return;
  if (!draft.value.id || dirty.value) {
    if (!(await save())) return;
  }
  const d = draft.value;
  if (!d.record || d.remote || d.reconciling) return;
  const epoch = session.epoch.value,
    key = selected.value;
  await store.preview(d.record.id, d.record.draftVersion);
  if (epoch !== session.epoch.value) return;
  try {
    const record = await store.read(d.record.id);
    if (record) drafts.value[key] = from(record, d.lastPreview);
  } catch (error) {
    if (epoch === session.epoch.value) d.failure = normalizeFailure(error);
  }
}
let leaveResolve: ((value: boolean) => void) | null = null;
function close() {
  if (pending.value) return;
  action.value = null;
  leaveResolve?.(false);
  leaveResolve = null;
}
async function confirm() {
  const kind = action.value;
  if (kind === "leave") {
    store.dispose();
    action.value = null;
    leaveResolve?.(true);
    leaveResolve = null;
    return;
  }
  if (kind === "discard") {
    delete drafts.value.new;
    ensureNew();
    action.value = null;
    return;
  }
  const d = draft.value,
    key = selected.value,
    epoch = session.epoch.value;
  if (!d.record || !d.revision) return;
  pending.value = true;
  try {
    const result =
      kind === "publish"
        ? await store.publish(d.record.id, d.record.draftVersion, d.revision)
        : await store.unpublish(d.record.id, d.revision);
    if (epoch === session.epoch.value && result) {
      applied(result, key);
      action.value = null;
    }
  } catch (error) {
    if (epoch === session.epoch.value) {
      action.value = null;
      await failed(d, error, true);
    }
  } finally {
    if (epoch === session.epoch.value) pending.value = false;
  }
}
onBeforeRouteLeave(() => {
  if (!streaming.value && !dirty.value) return;
  action.value = "leave";
  return new Promise<boolean>((resolve) => {
    leaveResolve = resolve;
  });
});
function beforeUnload(event: BeforeUnloadEvent) {
  if (streaming.value || dirty.value) {
    event.preventDefault();
    event.returnValue = "";
  }
}
onMounted(() => window.addEventListener("beforeunload", beforeUnload));
onBeforeUnmount(() => {
  store.dispose();
  window.removeEventListener("beforeunload", beforeUnload);
  leaveResolve?.(false);
});
watch(session.epoch, () => {
  drafts.value = {};
  ensureNew();
  selected.value = "new";
  action.value = null;
  leaveResolve?.(true);
  leaveResolve = null;
});
</script>
<template>
  <div>
    <div class="section-head">
      <div>
        <h1>{{ copy("a.presets") }}</h1>
        <p class="muted">{{ copy("preview.rule") }}</p>
      </div>
      <button class="btn primary" :disabled="busy" @click="newPreset">
        {{ copy("newpreset") }}
      </button>
    </div>
    <AppError :failure="store.state.value.listFailure" /><button
      v-if="store.state.value.listFailure"
      class="btn"
      @click="store.load"
    >
      {{ copy("retry") }}
    </button>
    <div class="admin-master-detail">
      <section class="panel admin-records">
        <h2>{{ copy("a.preset.list") }}</h2>
        <button
          v-for="p in store.state.value.items"
          :key="p.id"
          class="admin-record"
          :class="{ selected: selected === p.id }"
          :disabled="busy"
          @click="select(p.id)"
        >
          <strong>{{ drafts[p.id]?.value.title || p.title }}</strong
          ><span>{{ copy("a.preset.state." + state(p)) }}</span>
        </button>
      </section>
      <section v-if="draft" class="panel">
        <span class="pill">{{ copy("a.preset.state." + phase) }}</span>
        <p class="field-help">{{ copy("preset.draftnote") }}</p>
        <AppError :failure="draft.failure ?? store.failure.value" /><AppError
          :failure="store.state.value.optionsFailure"
        /><button
          v-if="store.state.value.optionsFailure"
          class="btn"
          :disabled="busy"
          @click="store.readOptions"
        >
          {{ copy("retry") }}
        </button>
        <p v-if="options?.availability.kind === 'blocked'" class="notice warn">
          {{
            options.availability.reason === "credentialMissing"
              ? copy("a.key.input") + " · " + copy("a.key.missing")
              : copy("nomodel.desc")
          }}
        </p>
        <p v-if="invalid" class="notice error" role="alert">
          {{ copy("a.preset.invalid") }}
        </p>
        <div v-if="draft.remote" class="notice">
          <h3>{{ draft.remote.preset.title }}</h3>
          <GenerationSettings
            :configuration="{
              ...draft.remote.preset.configuration,
              modelName: draft.remote.preset.configuration.model.name,
            }"
          />
        </div>
        <button
          v-if="draft.reconciling"
          class="btn"
          :disabled="busy"
          @click="reconcile(draft)"
        >
          {{ copy("retry") }}</button
        ><button
          v-if="draft.unknownCreate"
          class="btn"
          @click="action = 'discard'"
        >
          {{ copy("cancel") }}
        </button>
        <form @submit.prevent="save">
          <fieldset
            :disabled="busy || draft.reconciling || draft.unknownCreate"
          >
            <div class="preset-title-field">
              <label class="field"
                ><span>{{ copy("preset.name") }}</span
                ><input
                  v-model="draft.value.title"
                  required
                  aria-describedby="preset-title-hint"
              /></label>
              <p id="preset-title-hint" class="field-help">
                {{ copy("preset.namehint") }}
              </p>
            </div>
            <WordPicker
              id="preset-words"
              :key="selected"
              :selected-entries="draft.value.words"
              :candidates="vocabulary.state.value.candidates"
              :query="vocabulary.state.value.query"
              :search-status="vocabulary.state.value.searchStatus"
              :disabled="busy || draft.reconciling || draft.unknownCreate"
              @query="vocabulary.setQuery"
              @add="addWord"
              @remove="removeWord"
              @retry="vocabulary.search(vocabulary.state.value.query)"
            />
            <div class="form-grid">
              <label class="field"
                ><span>{{ copy("model") }}</span
                ><AppSelect v-model="draft.value.modelId" required>
                  <option value="">{{ copy("select") }}</option>
                  <option
                    v-if="draft.value.modelId && !modelExists"
                    :value="draft.value.modelId"
                  >
                    {{ copy("a.preset.modelmissing") }}
                  </option>
                  <option
                    v-for="model in options?.models ?? []"
                    :key="model.id"
                    :value="model.id"
                  >
                    {{ model.name }}
                  </option>
                </AppSelect></label
              ><label class="field"
                ><span>{{ copy("style") }}</span
                ><AppSelect v-model="draft.value.scenario">
                  <option
                    v-for="value in options?.scenarios ?? []"
                    :key="value"
                    :value="value"
                  >
                    {{ format.scenario(value) }}
                  </option>
                </AppSelect></label
              ><label class="field"
                ><span>{{ copy("length") }}</span
                ><AppSelect v-model="draft.value.length">
                  <option
                    v-for="value in options?.lengths ?? []"
                    :key="value"
                    :value="value"
                  >
                    {{ format.length(value) }}
                  </option>
                </AppSelect></label
              ><label class="field"
                ><span>{{ copy("explain") }}</span
                ><AppSelect v-model="draft.value.meaningLanguage" required>
                  <option value="">{{ copy("select") }}</option>
                  <option
                    v-for="value in options?.meaningLanguages ?? []"
                    :key="value"
                    :value="value"
                  >
                    {{ format.meaning(value) }}
                  </option>
                </AppSelect></label
              >
            </div>
          </fieldset>
          <div class="actions form-footer">
            <button
              class="btn"
              type="submit"
              :disabled="busy || draft.reconciling || draft.unknownCreate"
            >
              {{ copy("save.draft") }}</button
            ><button
              v-if="streaming"
              class="btn"
              type="button"
              :disabled="!store.stream.value.runId || store.busy.value"
              @click="store.cancel"
            >
              {{ copy("cancelgen") }}</button
            ><button
              v-else
              class="btn"
              type="button"
              :disabled="
                busy ||
                !ready ||
                !modelExists ||
                draft.reconciling ||
                draft.unknownCreate
              "
              @click="preview"
            >
              {{ copy("previewgen") }}</button
            ><button
              class="btn primary"
              type="button"
              :disabled="!publishable"
              @click="action = 'publish'"
            >
              {{ copy("publish") }}</button
            ><button
              v-if="draft.record?.listed"
              class="btn"
              type="button"
              :disabled="busy"
              @click="action = 'unlist'"
            >
              {{ copy("unlist") }}
            </button>
          </div>
        </form>
        <p v-if="streaming" class="notice">{{ copy("create.generating") }}</p>
        <p v-else-if="phase === 'cancelled'" class="notice warn">
          {{ copy("create.cancelled") }}
        </p>
        <section v-if="streaming || draft.lastPreview" class="article section">
          <div class="section-head">
            <h2>{{ copy("preview") }}</h2>
            <span class="pill">{{ copy("sample") }}</span>
          </div>
          <h3>{{ draft.value.title }}</h3>
          <p v-if="streaming" class="story-text" aria-live="polite">
            {{ store.stream.value.text }}
          </p>
          <p v-if="draft.lastPreview" class="story-text preset-sample-text">
            {{ draft.lastPreview?.result.passage }}
          </p>
          <PresetWordMeanings
            v-if="draft.lastPreview"
            :targets="draft.lastPreview.result.targets"
            :meaning-language="draft.lastPreview.configuration.meaningLanguage"
          />
          <p v-if="previewStale" class="notice warn">
            {{ copy("preview.required") }}
          </p>
        </section>
        <PresetWordMeanings
          v-if="!draft.lastPreview"
          :targets="[]"
          :meaning-language="draft.value.meaningLanguage || undefined"
        />
        <p class="muted usage-note">
          {{ copy("usage") }} ·
          {{ draft.record?.preview?.usage.providerCalls ?? copy("unknown") }} ·
          {{
            draft.record?.preview?.usage.cost
              ? draft.record.preview.usage.cost.amount +
                " " +
                draft.record.preview.usage.cost.unit
              : copy("unknown")
          }}
        </p>
      </section>
    </div>
    <AppDialog
      id="preset-confirm"
      :open="action !== null"
      :title="
        copy(
          action === 'publish'
            ? 'publish'
            : action === 'unlist'
              ? 'unlist'
              : 'l.leave.title',
        )
      "
      @close="close"
      ><p>
        {{
          copy(
            action === "unlist"
              ? "a.preset.unlist"
              : action === "publish"
                ? "preset.draftnote"
                : "l.leave.desc",
          )
        }}
      </p>
      <template #footer
        ><button class="btn" :disabled="pending" @click="close">
          {{ copy("cancel") }}</button
        ><button class="btn primary" :disabled="pending" @click="confirm">
          {{ copy("confirm") }}
        </button></template
      ></AppDialog
    >
  </div>
</template>
