<script setup lang="ts">
import type {
  GroupCode,
  PassageLength,
  AppFailure,
} from "@application/shared/models";
import type { GroupDraft, GroupImpact } from "@application/admin/configuration";
import { mergeEdited } from "@application/admin/growth-drafts";
import { normalizeFailure } from "@application/shared/failure";
definePageMeta({ middleware: "admin", layout: "admin" });
const admin = useAdminStore(),
  { copy } = useDesignCopy(),
  session = useSessionStore();
const selected = ref<GroupCode>("visitor"),
  drafts = reactive<Partial<Record<GroupCode, GroupDraft>>>({});
const lengths: PassageLength[] = ["short", "medium", "long", "xlong"];
const failure = shallowRef<AppFailure | null>(null),
  pending = shallowRef<{
    code: GroupCode;
    input: GroupDraft;
    impact: GroupImpact;
  } | null>(null);
const prioritiesOpen = ref(false),
  priorities = ref<{ code: GroupCode; priority: number }[]>([]),
  priorityBaseline = ref<{ code: GroupCode; priority: number }[]>([]),
  priorityRemote = ref<{ code: GroupCode; priority: number }[] | null>(null),
  priorityRevision = ref(""),
  priorityImpact = shallowRef<{
    affectedBaseUsers: number;
    affectedTrialUsers: number;
    revision: string;
  } | null>(null);
const busy = computed(() =>
    ["loading", "saving"].includes(admin.state.value.status),
  ),
  draft = computed(() => drafts[selected.value]);
const warnings = computed(() => {
  const value = draft.value;
  if (!value) return [];
  return [
    !value.modelIds.some((id) =>
      admin.state.value.models.some(
        (m) => m.id === id && m.enabled && !m.retiredAt,
      ),
    )
      ? "a.plan.nomodel"
      : null,
    !value.allowedLengths.length ? "a.plan.nolength" : null,
    value.rolling24hLimit === 0 ? "a.plan.zero" : null,
  ].filter((key): key is string => key !== null);
});
const baselines = reactive<Partial<Record<GroupCode, GroupDraft>>>({}),
  remotes = reactive<Partial<Record<GroupCode, GroupDraft>>>({});
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
function groupValue(
  group: (typeof admin.state.value.groups)[number],
): GroupDraft {
  return {
    priority: group.priority,
    rolling24hLimit: group.rolling24hLimit,
    maxEntries: group.maxEntries,
    allowedLengths: [...group.allowedLengths],
    modelIds: group.models.map((m) => m.id),
    expectedRevision: group.revision,
  };
}
function initialize() {
  for (const group of admin.state.value.groups) {
    const value = groupValue(group);
    drafts[group.code] = value;
    baselines[group.code] = clone(value);
  }
}
await usePageLoader("admin-plans", async () => {
  await admin.loadGroups();
  await admin.loadModels();
});
initialize();
useLocalizedHead("admin.plans");
function unlimited(event: Event) {
  if (draft.value)
    draft.value.rolling24hLimit = (event.target as HTMLInputElement).checked
      ? null
      : 0;
}
async function preview() {
  const code = selected.value,
    local = draft.value,
    remote = remotes[code],
    baseline = baselines[code];
  if (!local || busy.value) return;
  if (remote && baseline) {
    drafts[code] = {
      ...mergeEdited(baseline, clone(local), remote),
      expectedRevision: remote.expectedRevision,
    };
    baselines[code] = clone(remote);
    Reflect.deleteProperty(remotes, code);
  }
  const value = drafts[code]!;
  failure.value = null;
  const input: GroupDraft = {
    ...value,
    modelIds: [...value.modelIds],
    allowedLengths: [...value.allowedLengths],
  };
  const impact = await admin.previewGroup(selected.value, input);
  if (impact) pending.value = { code: selected.value, input, impact };
  else await reconcile(selected.value);
}
async function reconcile(code: GroupCode) {
  const epoch = session.epoch.value;
  failure.value = admin.state.value.failure;
  await admin.loadGroups();
  if (epoch !== session.epoch.value) return;
  const current = admin.state.value.groups.find((g) => g.code === code);
  if (current) remotes[code] = groupValue(current);
}

async function save() {
  const intent = pending.value;
  if (!intent) return;
  try {
    await admin.saveGroup(intent.code, intent.input);
    pending.value = null;
    await admin.loadGroups();
    const group = admin.state.value.groups.find((g) => g.code === intent.code);
    if (group) {
      drafts[intent.code] = groupValue(group);
      baselines[intent.code] = clone(drafts[intent.code]!);
      Reflect.deleteProperty(remotes, intent.code);
    }
  } catch {
    pending.value = null;
    await reconcile(intent.code);
  }
}
async function reconcilePriorities() {
  const epoch = session.epoch.value;
  await admin.loadGroups();
  if (epoch !== session.epoch.value) return;
  priorityRemote.value = admin.state.value.groups.map((g) => ({
    code: g.code,
    priority: g.priority,
  }));
  priorityRevision.value =
    admin.state.value.groups[0]?.revision ?? priorityRevision.value;
}
function openPriorities() {
  priorities.value = admin.state.value.groups.map((g) => ({
    code: g.code,
    priority: g.priority,
  }));
  priorityBaseline.value = clone(priorities.value);
  priorityRemote.value = null;
  priorityRevision.value = admin.state.value.groups[0]?.revision ?? "";
  priorityImpact.value = null;
  failure.value = null;
  prioritiesOpen.value = true;
}
async function previewPriority() {
  if (priorityRemote.value) {
    priorities.value = priorities.value.map((local) => {
      const base = priorityBaseline.value.find((g) => g.code === local.code);
      return local.priority === base?.priority
        ? (priorityRemote.value!.find((g) => g.code === local.code) ?? local)
        : local;
    });
    priorityBaseline.value = clone(priorityRemote.value);
    priorityRemote.value = null;
  }
  priorityImpact.value = await admin.previewPriorities(
    priorities.value,
    priorityRevision.value,
  );
  if (!priorityImpact.value) {
    failure.value = admin.state.value.failure;
    await reconcilePriorities();
  }
}
async function savePriority() {
  if (!priorityImpact.value) return;
  try {
    await admin.savePriorities(priorities.value, priorityRevision.value);
    for (const group of admin.state.value.groups) {
      const local = drafts[group.code],
        base = baselines[group.code],
        fresh = groupValue(group);
      if (local && base && JSON.stringify(local) === JSON.stringify(base)) {
        drafts[group.code] = fresh;
        baselines[group.code] = clone(fresh);
      } else if (local) remotes[group.code] = fresh;
    }
    prioritiesOpen.value = false;
  } catch (error) {
    failure.value = normalizeFailure(error);
    priorityImpact.value = null;
    await reconcilePriorities();
  }
}
watch(session.epoch, () => {
  for (const code of Object.keys(drafts)) Reflect.deleteProperty(drafts, code);
  pending.value = null;
  prioritiesOpen.value = false;
  priorityImpact.value = null;
});
</script>
<template>
  <div>
    <div class="page-head">
      <h1>{{ copy("a.plans") }}</h1>
      <button class="btn" :disabled="busy || !draft" @click="openPriorities">
        {{ copy("priority") }}
      </button>
    </div>
    <AppError :failure="failure ?? admin.state.value.failure" />
    <div class="tabs">
      <button
        v-for="group in admin.state.value.groups"
        :key="group.code"
        class="btn"
        :class="{ selected: selected === group.code }"
        :disabled="busy"
        @click="selected = group.code"
      >
        {{ copy("a.plan." + group.code) }}
      </button>
    </div>
    <dl v-if="remotes[selected]" class="admin-facts notice">
      <div>
        <dt>{{ copy("priority") }}</dt>
        <dd>{{ remotes[selected]!.priority }}</dd>
      </div>
      <div>
        <dt>{{ copy("words.limit") }}</dt>
        <dd>{{ remotes[selected]!.maxEntries }}</dd>
      </div>
      <div>
        <dt>{{ copy("a.plan.limit") }}</dt>
        <dd>
          {{ remotes[selected]!.rolling24hLimit ?? copy("a.plan.unlimited") }}
        </dd>
      </div>
      <div>
        <dt>{{ copy("a.plan.lengths") }}</dt>
        <dd>
          {{
            remotes[selected]!.allowedLengths.map((v) =>
              copy("a.length." + v),
            ).join(" / ") || "—"
          }}
        </dd>
      </div>
      <div>
        <dt>{{ copy("a.plan.models") }}</dt>
        <dd>
          {{
            remotes[selected]!.modelIds.map(
              (id) =>
                admin.state.value.models.find((m) => m.id === id)
                  ?.displayName ?? id,
            ).join(" / ") || "—"
          }}
        </dd>
      </div>
    </dl>
    <form v-if="draft" class="panel" @submit.prevent="preview">
      <details class="form-help">
        <summary>{{ copy("help.rules") }}</summary>
        <p class="notice">{{ copy("plan.effect") }}</p>
      </details>
      <p v-if="warnings.length" class="notice warn">
        {{ warnings.map((key) => copy(key)).join(" · ") }}
      </p>
      <fieldset :disabled="busy">
        <div class="form-grid">
          <div>
            <fieldset class="admin-options">
              <legend>{{ copy("a.plan.models") }}</legend>
              <label
                v-for="model in admin.state.value.models.filter(
                  (m) => !m.retiredAt,
                )"
                :key="model.id"
                ><input
                  v-model="draft.modelIds"
                  type="checkbox"
                  :value="model.id"
                /><span
                  >{{ model.displayName
                  }}{{ model.enabled ? "" : " · " + copy("disabled") }}</span
                ></label
              ><button
                v-if="admin.state.value.nextModelCursor"
                class="btn small"
                type="button"
                @click="admin.loadModels(true)"
              >
                {{ copy("a.more") }}
              </button>
            </fieldset>
            <fieldset class="admin-options">
              <legend>{{ copy("a.plan.lengths") }}</legend>
              <label v-for="length in lengths" :key="length"
                ><input
                  v-model="draft.allowedLengths"
                  type="checkbox"
                  :value="length"
                /><span>{{ copy("a.length." + length) }}</span></label
              >
            </fieldset>
          </div>
          <div>
            <label class="field"
              ><span>{{ copy("priority") }}</span
              ><input
                v-model.number="draft.priority"
                type="number"
                min="0"
                step="1"
                required /></label
            ><label class="field"
              ><span>{{ copy("words.limit") }}</span
              ><input
                v-model.number="draft.maxEntries"
                type="number"
                min="1"
                step="1"
                required /></label
            ><label class="field"
              ><span>{{ copy("a.plan.limit") }}</span
              ><input
                v-model.number="draft.rolling24hLimit"
                type="number"
                min="0"
                step="1"
                :disabled="draft.rolling24hLimit === null"
                :required="draft.rolling24hLimit !== null" /></label
            ><label class="field inline"
              ><input
                type="checkbox"
                :checked="draft.rolling24hLimit === null"
                @change="unlimited"
              /><span>{{ copy("a.plan.unlimited") }}</span></label
            >
            <p class="muted">{{ copy("a.plan.window") }}</p>
          </div>
        </div>
        <div class="form-footer">
          <button class="btn primary" type="submit">
            <AppIcon name="save" />
            {{ copy("a.save") }}
          </button>
        </div>
      </fieldset>
    </form>
    <AppDialog
      id="plan-impact"
      :open="pending !== null"
      :title="copy('a.plan.confirm')"
      @close="!busy && (pending = null)"
      ><template v-if="pending"
        ><p class="notice">{{ copy("plan.effect") }}</p>
        <p v-if="pending.impact.losesAllModels" class="notice warn">
          {{ copy("a.plan.nomodel") }}
        </p>
        <p>
          {{ copy("a.plan." + pending.code) }} · {{ copy("priority") }}
          {{ pending.input.priority }}
        </p></template
      ><template #footer
        ><button class="btn" :disabled="busy" @click="pending = null">
          {{ copy("cancel") }}</button
        ><button class="btn primary" :disabled="busy" @click="save">
          {{ copy("a.save") }}
        </button></template
      ></AppDialog
    >
    <AppDialog
      id="plan-priorities"
      :open="prioritiesOpen"
      :title="copy('priority')"
      @close="!busy && (prioritiesOpen = false)"
      ><AppError :failure="failure" />
      <dl v-if="priorityRemote" class="admin-facts notice">
        <div v-for="group in priorityRemote" :key="group.code">
          <dt>{{ copy("a.plan." + group.code) }}</dt>
          <dd>{{ group.priority }}</dd>
        </div>
      </dl>
      <form id="priorities-form" @submit.prevent="previewPriority">
        <fieldset :disabled="busy || priorityImpact !== null">
          <label v-for="group in priorities" :key="group.code" class="field"
            ><span>{{ copy("a.plan." + group.code) }}</span
            ><input
              v-model.number="group.priority"
              type="number"
              min="0"
              step="1"
              required
          /></label>
        </fieldset>
      </form>
      <template v-if="priorityImpact"
        ><p class="notice">{{ copy("plan.effect") }}</p></template
      ><template #footer
        ><button
          class="btn"
          :disabled="busy"
          @click="
            priorityImpact ? (priorityImpact = null) : (prioritiesOpen = false)
          "
        >
          {{ copy("cancel") }}</button
        ><button
          v-if="priorityImpact"
          class="btn primary"
          :disabled="busy"
          @click="savePriority"
        >
          {{ copy("confirm") }}</button
        ><button
          v-else
          class="btn primary"
          :disabled="busy"
          form="priorities-form"
          type="submit"
        >
          {{ copy("a.save") }}
        </button></template
      ></AppDialog
    >
  </div>
</template>
