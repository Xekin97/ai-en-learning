<script setup lang="ts">
import type { DeepReadonly } from "vue";
import { useAdminItemsStore } from "@runtime/stores/admin-items";
import { canonicalAmount, mergeEdited } from "@application/admin/growth-drafts";
import { itemTypeNames } from "@presentation/admin/item-type-names";
import type {
  ItemDefinitionModel,
  ItemDefinitionInput,
  ItemDefinitionEffect,
  ItemReferenceModel,
} from "@application/admin/items";
import type { ItemKind } from "@application/growth/models";
import type { PlanCode } from "@application/shared/models";
const emit = defineEmits<{
    reference: [value: ItemReferenceModel];
    busy: [value: boolean];
  }>(),
  items = useAdminItemsStore(),
  admin = useAdminStore(),
  session = useSessionStore(),
  { copy, language } = useDesignCopy();
const query = ref(""),
  kind = ref<ItemKind | "">(""),
  listed = ref<"all" | "listed" | "unlisted">("all"),
  open = ref(false),
  deletion = shallowRef<DeepReadonly<ItemDefinitionModel> | null>(null),
  blockedDelete = ref(false),
  invalid = ref(false);
const itemKinds: ItemKind[] = [
  "makeup",
  "extra_credit",
  "model_trial",
  "plan_trial",
];
const empty = () => ({
  id: null as string | null,
  revision: null as string | null,
  kind: "model_trial" as ItemKind,
  name: { zh: "", en: "" },
  description: { zh: "", en: "" },
  price: "",
  days: "",
  duration: "",
  count: "",
  retirementPoints: "",
  modelIds: [] as string[],
  plan: "basic" as PlanCode,
});
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
const baseline = ref(empty()),
  unknownCreate = ref(false);
const draft = ref(empty()),
  known = ref<DeepReadonly<ItemDefinitionModel> | null>(null);
const referencedModelIds = computed(() => [
  ...new Set([
    ...baseline.value.modelIds,
    ...draft.value.modelIds,
    ...(known.value?.effect.kind === "model_trial"
      ? known.value.effect.modelIds
      : []),
  ]),
]);
const modelsReady = computed(() =>
  referencedModelIds.value.every((id) =>
    admin.state.value.models.some((model) => model.id === id),
  ),
);
const modelOptions = computed(() =>
  admin.state.value.models.filter(
    (model) => !model.retiredAt || referencedModelIds.value.includes(model.id),
  ),
);
const loadReferencedModels = () => admin.ensureModels(referencedModelIds.value);
const names = (value: DeepReadonly<ItemDefinitionModel>) =>
  value.name[language.value] ||
  value.name[language.value === "zh" ? "en" : "zh"] ||
  "—";
const rows = computed(() =>
  items.state.value.items.filter(
    (i) =>
      (!kind.value || i.kind === kind.value) &&
      (listed.value === "all" || i.listed === (listed.value === "listed")) &&
      [i.name.zh, i.name.en].some((v) =>
        (v ?? "").toLocaleLowerCase().includes(query.value.toLocaleLowerCase()),
      ),
  ),
);
function fields(item?: DeepReadonly<ItemDefinitionModel>) {
  const value = empty();
  if (item) {
    const effect = item.effect;
    Object.assign(value, {
      id: item.id,
      revision: item.revision,
      kind: item.kind,
      name: { zh: item.name.zh ?? "", en: item.name.en ?? "" },
      description: {
        zh: item.description.zh ?? "",
        en: item.description.en ?? "",
      },
      price: item.exchangePrice,
      days: String(item.activationTtlSeconds / 86400),
      duration:
        "trialSeconds" in effect ? String(effect.trialSeconds / 86400) : "",
      count: effect.kind === "extra_credit" ? String(effect.extraCount) : "",
      retirementPoints:
        effect.kind === "model_trial" ? effect.retirementPoints : "",
      modelIds: effect.kind === "model_trial" ? [...effect.modelIds] : [],
      plan: effect.kind === "plan_trial" ? effect.targetPlanCode : "basic",
    });
  }
  return value;
}
function edit(item?: DeepReadonly<ItemDefinitionModel>) {
  known.value = null;
  invalid.value = false;
  unknownCreate.value = false;
  draft.value = fields(item);
  baseline.value = clone(draft.value);
  open.value = true;
  void loadReferencedModels();
}

function close() {
  if (!items.busy.value) open.value = false;
}
function typeChange() {
  draft.value.duration = "";
  draft.value.count = "";
  draft.value.retirementPoints = "";
  draft.value.modelIds = [];
  draft.value.plan = "basic";
}
function seconds(value: string | number) {
  const n = Number(value) * 86400;
  return String(value).trim() && Number.isSafeInteger(n) && n > 0 ? n : null;
}
async function save() {
  if (unknownCreate.value || !modelsReady.value) return;
  if (known.value) {
    const current = fields(known.value);
    draft.value = {
      ...mergeEdited(baseline.value, clone(draft.value), current),
      revision: current.revision,
    };
    baseline.value = clone(current);
    known.value = null;
  }
  const epoch = session.epoch.value;
  const d = draft.value,
    ttl = seconds(d.days),
    duration = seconds(d.duration);
  invalid.value =
    !ttl ||
    !canonicalAmount(d.price) ||
    (!d.name.zh.trim() && !d.name.en.trim()) ||
    (d.kind === "model_trial" &&
      (!duration ||
        !d.modelIds.length ||
        !canonicalAmount(d.retirementPoints))) ||
    (d.kind === "plan_trial" && !duration) ||
    (d.kind === "extra_credit" &&
      (!/^[1-9]\d*$/.test(d.count) || !Number.isSafeInteger(Number(d.count))));
  if (invalid.value || !ttl) return;
  let effect: ItemDefinitionEffect;
  if (d.kind === "makeup") effect = { kind: d.kind };
  else if (d.kind === "extra_credit")
    effect = { kind: d.kind, extraCount: Number(d.count) };
  else if (d.kind === "model_trial")
    effect = {
      kind: d.kind,
      modelIds: [...d.modelIds],
      trialSeconds: duration!,
      retirementPoints: d.retirementPoints,
    };
  else
    effect = { kind: d.kind, targetPlanCode: d.plan, trialSeconds: duration! };
  const input: ItemDefinitionInput = {
    kind: d.kind,
    name: { zh: d.name.zh.trim() || null, en: d.name.en.trim() || null },
    description: {
      zh: d.description.zh.trim() ? d.description.zh : null,
      en: d.description.en.trim() ? d.description.en : null,
    },
    exchangePrice: d.price,
    activationTtlSeconds: ttl,
    effect,
  };
  const result = await items.save(d.id, input, d.revision);
  if (epoch !== session.epoch.value) return;
  if (result) open.value = false;
  else if (d.id) {
    known.value = items.state.value.items.find((i) => i.id === d.id) ?? null;
    await loadReferencedModels();
  } else if (
    items.failure.value?.status === null ||
    (items.failure.value?.status ?? 0) >= 500
  )
    unknownCreate.value = true;
}
function askDelete(item: DeepReadonly<ItemDefinitionModel>) {
  deletion.value = item;
  blockedDelete.value = item.everIssued || item.referenceCount > 0;
}
async function confirmDelete() {
  const item = deletion.value;
  if (!item || blockedDelete.value) return;
  if (await items.remove(item.id, item.revision)) deletion.value = null;
  else
    blockedDelete.value = ["item_has_history", "item_in_use"].includes(
      items.failure.value?.code ?? "",
    );
}
watch(items.busy, (value) => emit("busy", value));
watch(session.epoch, () => {
  draft.value = empty();
  open.value = false;
  deletion.value = null;
  known.value = null;
});
</script>
<template>
  <div>
    <AppError
      :failure="items.state.value.failure ?? items.failure.value"
    /><button v-if="items.state.value.failure" class="btn" @click="items.load">
      {{ copy("retry") }}
    </button>
    <div class="toolbar">
      <label class="field"
        ><span>{{ copy("search") }}</span
        ><input v-model="query" type="search" /></label
      ><label class="field"
        ><span>{{ copy("type") }}</span
        ><AppSelect v-model="kind">
          <option value="">{{ copy("all") }}</option>
          <option v-for="type in itemKinds" :key="type" :value="type">
            {{ itemTypeNames[type][language] }}
          </option>
        </AppSelect></label
      ><label class="field"
        ><span>{{ copy("status") }}</span
        ><AppSelect v-model="listed">
          <option value="all">{{ copy("all") }}</option>
          <option value="listed">{{ copy("listed") }}</option>
          <option value="unlisted">{{ copy("unlisted") }}</option>
        </AppSelect></label
      ><button class="btn primary" :disabled="items.busy.value" @click="edit()">
        {{ copy("newitem") }}
      </button>
    </div>
    <div class="table-wrap" tabindex="0">
      <table class="data-table">
        <thead>
          <tr>
            <th
              v-for="label in ['name.zh', 'type', 'price', 'status', 'edit']"
              :key="label"
            >
              {{ copy(label) }}
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in rows" :key="item.id">
            <td>{{ names(item) }}</td>
            <td>{{ itemTypeNames[item.kind][language] }}</td>
            <td>{{ item.exchangePrice }}</td>
            <td>
              <span class="pill">{{
                copy(item.listed ? "listed" : "unlisted")
              }}</span>
            </td>
            <td>
              <div class="actions">
                <button
                  class="btn small"
                  :disabled="items.busy.value"
                  @click="edit(item)"
                >
                  {{ copy("edit") }}</button
                ><button
                  class="btn small"
                  :disabled="items.busy.value"
                  @click="items.listing(item.id, !item.listed, item.revision)"
                >
                  {{ copy(item.listed ? "unlist" : "list") }}</button
                ><button
                  class="btn small"
                  :disabled="items.busy.value"
                  @click="items.readReferences(item.id)"
                >
                  {{ copy("refs") }}</button
                ><button
                  class="btn small danger"
                  :disabled="items.busy.value"
                  @click="askDelete(item)"
                >
                  {{ copy("delete") }}
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
    <AppDialog
      id="item-definition"
      :open="open"
      :title="copy(draft.id ? 'edit' : 'newitem')"
      @close="close"
      ><AppError :failure="items.failure.value" />
      <p v-if="invalid" class="notice error" role="alert">
        {{ $t("error.validation") }}
      </p>
      <dl v-if="known" class="admin-facts">
        <div>
          <dt>{{ copy("name.zh") }}</dt>
          <dd>{{ known.name.zh || "—" }}</dd>
        </div>
        <div>
          <dt>{{ copy("name.en") }}</dt>
          <dd>{{ known.name.en || "—" }}</dd>
        </div>
        <div>
          <dt>{{ copy("desc.zh") }}</dt>
          <dd>{{ known.description.zh || "—" }}</dd>
        </div>
        <div>
          <dt>{{ copy("desc.en") }}</dt>
          <dd>{{ known.description.en || "—" }}</dd>
        </div>
        <div>
          <dt>{{ copy("deadline") }}</dt>
          <dd>{{ known.activationTtlSeconds / 86400 }}</dd>
        </div>
        <div v-if="'trialSeconds' in known.effect">
          <dt>{{ copy("duration") }}</dt>
          <dd>{{ known.effect.trialSeconds / 86400 }}</dd>
        </div>
        <div>
          <dt>{{ copy("price") }}</dt>
          <dd>{{ known.exchangePrice }}</dd>
        </div>
        <div v-if="known.effect.kind === 'model_trial'">
          <dt>{{ copy("retirementpoints") }}</dt>
          <dd>{{ known.effect.retirementPoints }}</dd>
        </div>
      </dl>
      <p class="notice">{{ copy("item.rule") }}</p>
      <form id="item-definition-form" @submit.prevent="save">
        <fieldset :disabled="items.busy.value">
          <label class="field"
            ><span>{{ copy("type") }}</span
            ><AppSelect
              v-model="draft.kind"
              :disabled="draft.id !== null"
              @change="typeChange"
            >
              <option v-for="type in itemKinds" :key="type" :value="type">
                {{ itemTypeNames[type][language] }}
              </option>
            </AppSelect></label
          >
          <div class="form-grid">
            <label
              v-for="locale in ['zh', 'en'] as const"
              :key="locale"
              class="field"
              ><span>{{ copy("name." + locale) }}</span
              ><input v-model="draft.name[locale]"
            /></label>
          </div>
          <div class="form-grid">
            <label
              v-for="locale in ['zh', 'en'] as const"
              :key="locale"
              class="field"
              ><span>{{ copy("desc." + locale) }}</span
              ><textarea v-model="draft.description[locale]" /></label
            ><label class="field"
              ><span>{{ copy("price") }}</span
              ><input
                v-model="draft.price"
                inputmode="numeric"
                pattern="0|[1-9][0-9]*"
                required /></label
            ><label class="field"
              ><span>{{ copy("deadline") }}</span
              ><input
                v-model="draft.days"
                type="number"
                min="0"
                step="any"
                required
            /></label>
          </div>
          <template v-if="draft.kind === 'model_trial'"
            ><AppError :failure="admin.state.value.failure" />
            <button
              v-if="!modelsReady && admin.state.value.failure"
              class="btn small"
              type="button"
              @click="loadReferencedModels"
            >
              {{ copy("retry") }}
            </button>
            <label class="field"
              ><span>{{ copy("model") }}</span
              ><AppSelect
                v-model="draft.modelIds"
                multiple
                required
                :disabled="!modelsReady"
              >
                <option
                  v-for="model in modelOptions"
                  :key="model.id"
                  :value="model.id"
                >
                  {{ model.displayName }}
                  {{ model.retiredAt ? ` · ${copy("retired")}` : "" }}
                </option>
              </AppSelect></label
            ><button
              v-if="admin.state.value.nextModelCursor"
              class="btn small"
              type="button"
              :disabled="!modelsReady || admin.state.value.status === 'loading'"
              @click="admin.loadModels(true)"
            >
              {{ copy("a.more") }}</button
            ><label class="field"
              ><span>{{ copy("retirementpoints") }}</span
              ><input
                v-model="draft.retirementPoints"
                inputmode="numeric"
                pattern="0|[1-9][0-9]*"
                required /></label></template
          ><label
            v-if="draft.kind === 'model_trial' || draft.kind === 'plan_trial'"
            class="field"
            ><span>{{ copy("duration") }}</span
            ><input
              v-model="draft.duration"
              type="number"
              min="0"
              step="any"
              required /></label
          ><label v-if="draft.kind === 'plan_trial'" class="field"
            ><span>{{ copy("plan") }}</span
            ><AppSelect v-model="draft.plan">
              <option
                v-for="plan in ['basic', 'pro', 'plus'] as const"
                :key="plan"
                :value="plan"
              >
                {{ copy("a.plan." + plan) }}
              </option>
            </AppSelect></label
          ><label v-if="draft.kind === 'extra_credit'" class="field"
            ><span>{{ copy("count") }}</span
            ><input
              v-model="draft.count"
              inputmode="numeric"
              pattern="[1-9][0-9]*"
              required
          /></label>
          <p class="notice">{{ copy("item.effect") }}</p>
        </fieldset>
      </form>
      <template #footer
        ><button class="btn" :disabled="items.busy.value" @click="close">
          {{ copy("cancel") }}</button
        ><button
          class="btn primary"
          form="item-definition-form"
          type="submit"
          :disabled="items.busy.value || unknownCreate || !modelsReady"
        >
          {{ copy("save") }}
        </button></template
      ></AppDialog
    >
    <AppDialog
      id="item-delete"
      :open="deletion !== null"
      :title="copy('delete')"
      @close="!items.busy.value && (deletion = null)"
      ><p>{{ deletion ? names(deletion) : "" }}</p>
      <p v-if="blockedDelete" class="notice warn">
        {{ copy("delete.blocked") }}
      </p>
      <AppError :failure="items.failure.value" /><template #footer
        ><button
          class="btn"
          :disabled="items.busy.value"
          @click="deletion = null"
        >
          {{ copy("cancel") }}</button
        ><button
          v-if="!blockedDelete"
          class="btn danger"
          :disabled="items.busy.value"
          @click="confirmDelete"
        >
          {{ copy("delete") }}
        </button></template
      ></AppDialog
    >
    <AppDialog
      id="item-references"
      :open="items.references.value !== null"
      :title="copy('refs')"
      @close="items.closeReferences"
      ><p v-if="!items.references.value?.items.length" class="notice">
        {{ copy("refs.none") }}
      </p>
      <button
        v-for="reference in items.references.value?.items ?? []"
        :key="reference.id"
        class="btn"
        @click="
          emit('reference', reference);
          items.closeReferences();
        "
      >
        {{ reference.name }}</button
      ><button
        v-if="items.references.value?.nextCursor"
        class="btn"
        @click="items.readReferences(items.references.value.id, true)"
      >
        {{ copy("a.more") }}
      </button></AppDialog
    >
  </div>
</template>
