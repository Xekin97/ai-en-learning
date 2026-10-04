<script setup lang="ts">
import type { AppFailure, ModelProtocol } from "@application/shared/models";
import type { ModelRemovalImpact } from "@application/admin/configuration";
import {
  modelDraft,
  modelConfiguration,
  needsConnectionKey,
  modelEntryDraft,
  repeatedModelIds,
  type ModelEntryDraft,
  type EditableModel,
} from "@application/admin/model-draft";
import {
  providerDraft,
  providerConfiguration,
  mergeProviderEntries,
  type EditableProvider,
} from "@application/admin/provider-draft";
import { mergeEdited } from "@application/admin/growth-drafts";
import { normalizeFailure } from "@application/shared/failure";
definePageMeta({ middleware: "admin", layout: "admin" });
const admin = useAdminStore(),
  { copy } = useDesignCopy(),
  session = useSessionStore();
const modelOpen = ref(false),
  discardOpen = ref(false),
  testing = ref(false),
  testTarget = ref<string | null>(null),
  testMessage = ref("");
const providerId = ref<string | null>(null),
  form = reactive(providerDraft());
let entrySequence = 0,
  testEpoch = 0;
const entries = ref<ModelEntryDraft[]>([]),
  baselineEntries = ref<ModelEntryDraft[]>([]);
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const baseline = ref(clone(form)),
  unknownCreate = ref(false),
  conflicted = ref(false);
const failure = shallowRef<AppFailure | null>(null),
  impact = shallowRef<ModelRemovalImpact | null>(null);
const busy = computed(
  () =>
    admin.state.value.status === "saving" ||
    admin.state.value.status === "loading",
);
const providers = computed(() => admin.state.value.providers);
const duplicateIds = computed(() => repeatedModelIds(entries.value));
const keyRequired = computed(() =>
  needsConnectionKey(form, admin.state.value.connections),
);
const protocolKey = (p: ModelProtocol) =>
  ({
    openai_chat: "chat",
    openai_responses: "responses",
    anthropic_messages: "anthropic",
  })[p];
await usePageLoader("admin-models", () => admin.loadModelProviders());
useLocalizedHead("admin.models");
function openProvider(provider?: EditableProvider) {
  failure.value = null;
  testMessage.value = "";
  testing.value = false;
  testTarget.value = null;
  testEpoch++;
  providerId.value = provider?.connection.id ?? null;
  Object.assign(form, providerDraft(provider, admin.state.value.modelRevision));
  entries.value = provider
    ? provider.models.map((m) => modelEntryDraft("entry-" + ++entrySequence, m))
    : [modelEntryDraft("entry-" + ++entrySequence)];
  baseline.value = clone(form);
  baselineEntries.value = clone(entries.value);
  unknownCreate.value = false;
  conflicted.value = false;
  modelOpen.value = true;
}
function discardModel() {
  testEpoch++;
  testing.value = false;
  testTarget.value = null;
  testMessage.value = "";
  form.apiKey = "";
  baseline.value.apiKey = "";
  entries.value = [];
  baselineEntries.value = [];
  providerId.value = null;
  modelOpen.value = false;
  discardOpen.value = false;
}
function closeModel() {
  if (busy.value) return;
  if (
    JSON.stringify(form) !== JSON.stringify(baseline.value) ||
    JSON.stringify(entries.value) !== JSON.stringify(baselineEntries.value)
  )
    discardOpen.value = true;
  else discardModel();
}
async function addEntry() {
  if (entries.value.length >= 1000) return;
  const entry = modelEntryDraft("entry-" + ++entrySequence);
  entries.value.push(entry);
  await nextTick();
  document
    .getElementById(entry.key)
    ?.querySelector<HTMLInputElement>('[name="providerModelId"]')
    ?.focus();
}
async function removeEntry(key: string) {
  const index = entries.value.findIndex((e) => e.key === key);
  if (
    index < 0 ||
    entries.value[index]?.modelId ||
    (!providerId.value && entries.value.length < 2)
  )
    return;
  entries.value.splice(index, 1);
  await nextTick();
  const next = entries.value[Math.min(index, entries.value.length - 1)];
  if (next)
    document
      .getElementById(next.key)
      ?.querySelector<HTMLInputElement>('[name="providerModelId"]')
      ?.focus();
}
function validForm(entry?: ModelEntryDraft) {
  const root = document.getElementById("model-form");
  if (!root) return false;
  const fields = entry
    ? [
        ...root.querySelectorAll<HTMLInputElement>(
          '[data-model-section="provider"] input',
        ),
        ...root.querySelectorAll<HTMLInputElement>(`#${entry.key} input`),
      ]
    : [...root.querySelectorAll<HTMLInputElement>("input")];
  for (const field of fields) {
    if (!field.checkValidity()) {
      const details = field.closest("details");
      if (details) details.open = true;
      return field.reportValidity();
    }
  }
  return true;
}
async function testConnection(model?: EditableModel, entry?: ModelEntryDraft) {
  if (testing.value || busy.value || (!model && (!entry || !validForm(entry))))
    return;
  const epoch = session.epoch.value,
    token = ++testEpoch;
  testing.value = true;
  testTarget.value = model?.id ?? entry?.key ?? null;
  testMessage.value = "gm.testing";
  failure.value = null;
  try {
    await admin.testModelConnection(
      modelConfiguration(
        model ? modelDraft(model) : { ...form, ...entry },
        admin.state.value.connections,
      ),
    );
    if (token === testEpoch && epoch === session.epoch.value)
      testMessage.value = "gm.test.ok";
  } catch (error) {
    if (token !== testEpoch || epoch !== session.epoch.value) return;
    const problem = normalizeFailure(error);
    testMessage.value =
      (
        {
          model_connection_auth: "gm.testing.auth",
          model_connection_protocol: "gm.testing.format",
          model_connection_rate_limited: "gm.rate",
          credential_missing: "gm.missingkey",
        } as Record<string, string>
      )[problem.code] ?? "gm.test.fail";
  } finally {
    if (token === testEpoch) testing.value = false;
  }
}
async function refreshDraft() {
  const epoch = session.epoch.value;
  await admin.loadModelProviders();
  if (epoch !== session.epoch.value || admin.state.value.failure) return;
  const remote = providers.value.find(
    (p) => p.connection.id === providerId.value,
  );
  if (providerId.value && !remote) return;
  const current = providerDraft(remote, admin.state.value.modelRevision);
  Object.assign(form, mergeEdited(baseline.value, clone(form), current), {
    expectedRevision: current.expectedRevision,
  });
  if (remote) {
    const remoteRows = remote.models.map((m) =>
      modelEntryDraft("entry-" + ++entrySequence, m),
    );
    entries.value = mergeProviderEntries(
      baselineEntries.value,
      clone(entries.value),
      remoteRows,
    );
    baselineEntries.value = clone(remoteRows);
  }
  baseline.value = clone(current);
  conflicted.value = false;
  failure.value = null;
}
async function saveModel() {
  if (
    busy.value ||
    unknownCreate.value ||
    conflicted.value ||
    duplicateIds.value.size ||
    !validForm()
  )
    return;
  const epoch = session.epoch.value;
  try {
    await admin.saveModelProvider(
      providerId.value,
      providerConfiguration(form, entries.value),
    );
    if (epoch !== session.epoch.value) return;
    discardModel();
    await admin.loadModelProviders();
  } catch (error) {
    if (epoch !== session.epoch.value) return;
    failure.value = normalizeFailure(error);
    conflicted.value = failure.value.code === "revision_conflict";
    if (failure.value.status === null || (failure.value.status ?? 0) >= 500)
      unknownCreate.value = true;
  }
}
async function remove(model: { id: string }) {
  failure.value = null;
  impact.value = await admin.previewRemoval(model.id);
}
function closeRemoval() {
  if (busy.value) return;
  if (impact.value) admin.clearRemoval(impact.value.model.id);
  impact.value = null;
}
async function confirmRemoval() {
  if (!impact.value) return;
  try {
    await admin.removeModel(impact.value.model.id, impact.value.revision);
    closeRemoval();
    await admin.loadModelProviders();
  } catch (error) {
    failure.value = normalizeFailure(error);
  }
}

watch(
  () => JSON.stringify({ form, entries: entries.value }),
  () => {
    testEpoch++;
    testing.value = false;
    testMessage.value = "";
  },
);
watch(session.epoch, () => {
  discardModel();
  impact.value = null;
  failure.value = null;
});
onBeforeUnmount(() => {
  discardModel();
  if (impact.value) admin.clearRemoval(impact.value.model.id);
});
</script>
<template>
  <div>
    <div class="page-head">
      <div>
        <h1>{{ copy("gm.title") }}</h1>
        <p>{{ copy("gm.subtitle") }}</p>
      </div>
      <button class="btn primary" :disabled="busy" @click="openProvider()">
        {{ copy("gm.add") }}
      </button>
    </div>
    <AppError :failure="admin.state.value.failure" />
    <section class="generic-provider-list" :aria-label="copy('gm.title')">
      <article
        v-for="provider in providers"
        :key="provider.connection.id"
        class="generic-provider-card"
        :data-provider-id="provider.connection.id"
      >
        <header class="generic-provider-heading">
          <div class="generic-model-symbol"><AppIcon name="bot" /></div>
          <div class="generic-model-copy">
            <div class="generic-model-title">
              <h2>{{ provider.connection.name }}</h2>
              <span class="pill"
                >{{ provider.models.length }}
                {{ copy("gm.models.count") }}</span
              >
            </div>
            <p class="generic-model-meta">
              <span>{{ provider.connection.baseUrl }}</span
              ><span>{{
                copy("gm." + protocolKey(provider.connection.protocol))
              }}</span
              ><span>{{
                provider.connection.maskedHint ||
                copy(
                  provider.connection.credentialConfigured
                    ? "gm.key.configured"
                    : "gm.key.missing",
                )
              }}</span>
            </p>
          </div>
          <button
            class="btn small"
            :disabled="busy"
            @click="openProvider(provider)"
          >
            {{ copy("gm.edit") }}
          </button>
        </header>
        <div class="generic-provider-models">
          <article
            v-for="model in provider.models"
            :key="model.id"
            class="generic-model-row"
          >
            <div class="generic-model-copy">
              <div class="generic-model-title">
                <h3>{{ model.displayName }}</h3>
                <span class="pill">{{
                  copy(model.enabled ? "gm.active" : "gm.inactive")
                }}</span>
              </div>
              <code>{{ model.providerModelId }}</code>
              <p v-if="model.description" class="generic-model-description">
                {{ model.description }}
              </p>
              <p
                v-if="testMessage && testTarget === model.id"
                class="notice"
                role="status"
              >
                {{ copy(testMessage) }}
              </p>
            </div>
            <div class="generic-model-actions">
              <button
                class="btn quiet small"
                :disabled="busy || testing"
                :aria-busy="testing && testTarget === model.id"
                @click="testConnection(model)"
              >
                {{
                  copy(
                    testing && testTarget === model.id
                      ? "gm.testing"
                      : "gm.test",
                  )
                }}</button
              ><button
                class="btn danger quiet small"
                :disabled="busy"
                @click="remove(model)"
              >
                {{ copy("a.remove") }}
              </button>
            </div>
          </article>
          <p v-if="!provider.models.length" class="provider-empty">
            {{ copy("gm.provider.empty") }}
          </p>
        </div>
      </article>
      <div v-if="!providers.length && !busy" class="generic-model-empty">
        <AppIcon name="bot" />
        <h2>{{ copy("gm.empty") }}</h2>
        <p>{{ copy("gm.empty.help") }}</p>
        <button class="btn primary" @click="openProvider()">
          {{ copy("gm.add") }}
        </button>
      </div>
    </section>
    <AppDialog
      id="admin-model"
      :open="modelOpen"
      :title="copy(providerId ? 'gm.edit' : 'gm.add')"
      @close="closeModel"
    >
      <AppError :failure="failure" />
      <p v-if="failure?.code === 'model_conflict'" class="notice warn">
        {{ copy("gm.batch.existing") }}
      </p>
      <p v-if="unknownCreate" class="notice warn">{{ copy("gm.unknown") }}</p>
      <div v-if="conflicted" class="notice warn">
        <p>{{ copy("gm.conflict") }}</p>
        <button class="btn" :disabled="busy" @click="refreshDraft">
          {{ copy("gm.refresh") }}
        </button>
      </div>
      <form id="model-form" @submit.prevent="saveModel">
        <fieldset class="generic-model-form" :disabled="busy">
          <section class="model-form-section" data-model-section="provider">
            <div class="model-section-heading">
              <span class="model-step">1</span>
              <div>
                <h3>{{ copy("gm.connection.section") }}</h3>
                <p>{{ copy("gm.connection.section.help") }}</p>
              </div>
            </div>
            <div class="generic-connection-fields">
              <div class="model-field-grid">
                <label class="field"
                  ><span>{{ copy("gm.provider") }}</span
                  ><input
                    v-model="form.connectionName"
                    name="connectionName"
                    maxlength="200"
                    :placeholder="copy('gm.provider.placeholder')"
                /></label>
                <div class="model-field">
                  <label class="field"
                    ><span>{{ copy("gm.protocol") }}</span
                    ><AppSelect v-model="form.protocol"
                      ><option value="openai_chat">
                        {{ copy("gm.chat") }}
                      </option>
                      <option value="openai_responses">
                        {{ copy("gm.responses") }}
                      </option>
                      <option value="anthropic_messages">
                        {{ copy("gm.anthropic") }}
                      </option></AppSelect
                    ></label
                  >
                  <p class="field-help">
                    {{ copy("gm." + protocolKey(form.protocol) + ".help") }}
                  </p>
                </div>
              </div>
              <div class="model-field">
                <label class="field"
                  ><span>{{ copy("gm.url") }}</span
                  ><input
                    v-model="form.baseUrl"
                    name="baseUrl"
                    type="url"
                    maxlength="2048"
                    required
                    placeholder="https://api.example.com/v1"
                /></label>
                <p class="field-help">{{ copy("gm.url.help") }}</p>
              </div>
              <div class="model-field">
                <label class="field"
                  ><span>{{ copy("gm.key") }}</span
                  ><input
                    v-model="form.apiKey"
                    name="apiKey"
                    type="password"
                    maxlength="8192"
                    autocomplete="new-password"
                    :required="keyRequired"
                    :placeholder="copy(keyRequired ? 'gm.key' : 'gm.key.keep')"
                /></label>
                <p class="field-help">
                  {{
                    copy(
                      keyRequired && form.originalConnectionId
                        ? "gm.missingkey"
                        : "gm.key.help",
                    )
                  }}
                </p>
              </div>
              <p v-if="providerId" class="field-help">
                {{
                  copy(
                    providerId
                      ? "gm.changed.connection"
                      : "gm.connection.changed.batch",
                  )
                }}
              </p>
            </div>
          </section>
          <section class="model-form-section" data-model-section="models">
            <div class="model-section-heading">
              <span class="model-step">2</span>
              <div>
                <h3>{{ copy("gm.models.section") }}</h3>
                <p>{{ copy("gm.models.section.help") }}</p>
              </div>
            </div>
            <section
              v-for="(entry, index) in entries"
              :id="entry.key"
              :key="entry.key"
              class="generic-model-item"
            >
              <div class="model-item-heading">
                <h4>{{ copy("gm.models.section") }} {{ index + 1 }}</h4>
                <button
                  v-if="!entry.modelId && (providerId || entries.length > 1)"
                  type="button"
                  class="btn quiet small"
                  @click="removeEntry(entry.key)"
                >
                  {{ copy("gm.model.remove") }}
                </button>
              </div>
              <div class="model-field-grid">
                <div class="model-field">
                  <label class="field"
                    ><span>{{ copy("gm.id") }}</span
                    ><input
                      v-model="entry.providerModelId"
                      name="providerModelId"
                      maxlength="500"
                      required
                      :aria-invalid="duplicateIds.has(entry.providerModelId)"
                      :placeholder="copy('gm.id.placeholder')"
                  /></label>
                  <p
                    v-if="duplicateIds.has(entry.providerModelId)"
                    class="field-help"
                    role="alert"
                  >
                    {{ copy("gm.duplicate") }}
                  </p>
                  <p v-else class="field-help">{{ copy("gm.id.help") }}</p>
                </div>
                <label class="field"
                  ><span>{{ copy("gm.name.optional") }}</span
                  ><input
                    v-model="entry.displayName"
                    name="displayName"
                    maxlength="200"
                    :placeholder="copy('gm.name.auto')"
                /></label>
              </div>
              <details class="generic-model-advanced">
                <summary>{{ copy("gm.advanced") }}</summary>
                <div class="model-advanced-fields">
                  <div class="model-field">
                    <label class="field"
                      ><span>{{ copy("gm.output") }}</span
                      ><input
                        v-model="entry.maxOutputTokens"
                        type="number"
                        name="maxOutputTokens"
                        min="1"
                        max="1048576"
                        step="1"
                    /></label>
                    <p class="field-help">{{ copy("gm.output.help") }}</p>
                  </div>
                  <div class="model-option">
                    <label class="check"
                      ><input
                        v-model="entry.outputMode"
                        type="checkbox"
                        true-value="json_schema"
                        false-value="prompt"
                        :disabled="form.protocol === 'anthropic_messages'"
                      />{{ copy("gm.structured") }}</label
                    >
                    <p class="field-help">{{ copy("gm.structured.help") }}</p>
                  </div>
                  <label class="field"
                    ><span>{{ copy("gm.description") }}</span
                    ><input
                      v-model="entry.description"
                      name="description"
                      maxlength="1000"
                  /></label>
                </div>
              </details>
              <div class="model-item-actions">
                <label class="check"
                  ><input v-model="entry.enabled" type="checkbox" />{{
                    copy("gm.enable")
                  }}</label
                ><button
                  class="btn quiet small"
                  type="button"
                  :disabled="busy || testing"
                  :aria-busy="testing && testTarget === entry.key"
                  @click="testConnection(undefined, entry)"
                >
                  {{
                    copy(
                      testing && testTarget === entry.key
                        ? "gm.testing"
                        : "gm.test",
                    )
                  }}
                </button>
              </div>
              <p
                v-if="testMessage && testTarget === entry.key"
                class="notice"
                role="status"
              >
                {{ copy(testMessage) }}
              </p>
            </section>
            <button
              type="button"
              class="btn model-add"
              :disabled="entries.length >= 1000"
              @click="addEntry"
            >
              {{ copy("gm.model.add") }}
            </button>
            <p v-if="entries.length >= 1000" class="field-help">
              {{ copy("gm.model.limit") }}
            </p>
            <p class="field-help">{{ copy("gm.test.note") }}</p>
          </section>
        </fieldset>
      </form>
      <template #footer>
        <button class="btn" :disabled="busy" @click="closeModel">
          {{ copy("cancel") }}
        </button>
        <button
          class="btn primary"
          type="submit"
          form="model-form"
          :disabled="
            busy || unknownCreate || conflicted || duplicateIds.size > 0
          "
        >
          {{ copy(providerId ? "gm.save" : "gm.models.save") }}
        </button>
      </template>
    </AppDialog>
    <AppDialog
      id="model-discard"
      :open="discardOpen"
      :title="copy('gm.unsaved')"
      @close="discardOpen = false"
      ><template #footer
        ><button class="btn" @click="discardOpen = false">
          {{ copy("gm.keep") }}</button
        ><button class="btn danger" @click="discardModel">
          {{ copy("gm.discard") }}
        </button></template
      ></AppDialog
    >
    <AppDialog
      id="model-removal"
      :open="impact !== null"
      :title="copy('model.remove.title')"
      @close="closeRemoval"
      ><template v-if="impact"
        ><h3>{{ impact.model.displayName }}</h3>
        <p class="notice warn">{{ copy("model.remove.desc") }}</p>
        <AppError :failure="failure" />
        <dl class="admin-facts">
          <div>
            <dt>{{ copy("a.plans") }}</dt>
            <dd>
              <p v-for="group in impact.affectedGroups" :key="group.code">
                {{ copy("a.plan." + group.code) }} ·
                {{ group.remainingEnabledModels
                }}{{
                  group.remainingEnabledModels === 0
                    ? " · " + copy("a.model.last")
                    : ""
                }}
              </p>
              <span v-if="!impact.affectedGroups.length">—</span>
            </dd>
          </div>
          <div>
            <dt>{{ copy("itemsettings") }}</dt>
            <dd>{{ impact.affectedItemDefinitions }}</dd>
          </div>
          <div>
            <dt>{{ copy("bag") }}</dt>
            <dd>{{ impact.affectedOwnedCards }}</dd>
          </div>
          <div>
            <dt>{{ copy("a.presets") }}</dt>
            <dd>{{ impact.affectedPresets }}</dd>
          </div>
        </dl>
        <p class="notice">{{ copy("a.model.removeimpact") }}</p></template
      ><template #footer
        ><button class="btn" :disabled="busy" @click="closeRemoval">
          {{ copy("cancel") }}</button
        ><button class="btn danger" :disabled="busy" @click="confirmRemoval">
          {{ copy("a.remove") }}
        </button></template
      ></AppDialog
    >
  </div>
</template>
