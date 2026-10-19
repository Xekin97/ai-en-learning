<script setup lang="ts">
import type {
  GroupCode,
  PassageLength,
  AppFailure,
} from "@application/shared/models";
import type {
  GroupDraft,
  GroupImpact,
  PriorityImpact,
} from "@application/admin/configuration";
import { mergeEdited } from "@application/admin/growth-drafts";
import { normalizeFailure } from "@application/shared/failure";
definePageMeta({ middleware: "admin", layout: "admin" });
const admin = useAdminStore(),
  { copy } = useDesignCopy(),
  session = useSessionStore();
const selected = ref<GroupCode>("visitor"),
  drafts = reactive<Partial<Record<GroupCode, PlanFormDraft>>>({});
type PlanFormDraft = Omit<GroupDraft, "contentRepairLimit"> & {
  contentRepairLimitRaw: string;
};
const lengths: PassageLength[] = ["short", "medium", "long", "xlong"];
const failure = shallowRef<AppFailure | null>(null),
  pending = shallowRef<{
    code: GroupCode;
    input: GroupDraft;
    impact: GroupImpact;
    editRevision: number;
  } | null>(null);
const editRevisions = reactive<Partial<Record<GroupCode, number>>>({}),
  lastPositiveLimits = reactive<Partial<Record<GroupCode, string>>>({});
const prioritiesOpen = ref(false),
  priorities = ref<{ code: GroupCode; priority: number }[]>([]),
  priorityBaseline = ref<{ code: GroupCode; priority: number }[]>([]),
  priorityRemote = ref<{ code: GroupCode; priority: number }[] | null>(null),
  priorityRevision = ref(""),
  priorityImpact = shallowRef<PriorityImpact | null>(null);
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
const baselines = reactive<Partial<Record<GroupCode, PlanFormDraft>>>({}),
  remotes = reactive<Partial<Record<GroupCode, PlanFormDraft>>>({});
const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v));
function groupValue(
  group: (typeof admin.state.value.groups)[number],
): PlanFormDraft {
  return {
    priority: group.priority,
    rolling24hLimit: group.rolling24hLimit,
    maxEntries: group.maxEntries,
    allowedLengths: [...group.allowedLengths],
    modelIds: group.models.map((m) => m.id),
    expectedRevision: group.revision,
    contentReviewEnabled: group.contentReviewEnabled,
    contentRepairLimitRaw: String(group.contentRepairLimit),
  };
}
const contentLimitValid = computed(() => {
  const value = draft.value?.contentRepairLimitRaw ?? "";
  return /^(0|[1-9][0-9]?)$/.test(value);
});
const contentEditable = computed(() =>
  ["pro", "plus"].includes(selected.value),
);
const contentEnabled = computed(() => {
  const raw = draft.value?.contentRepairLimitRaw ?? "";
  return contentLimitValid.value
    ? Number(raw) > 0
    : (baselines[selected.value]?.contentReviewEnabled ?? false);
});
function invalidate(code = selected.value) {
  editRevisions[code] = (editRevisions[code] ?? 0) + 1;
  pending.value = null;
}
function toggleContent(event: Event) {
  const value = draft.value;
  if (!value || !contentEditable.value) return;
  const checked = (event.target as HTMLInputElement).checked;
  if (
    !checked &&
    contentLimitValid.value &&
    Number(value.contentRepairLimitRaw) > 0
  )
    lastPositiveLimits[selected.value] = value.contentRepairLimitRaw;
  value.contentRepairLimitRaw = checked
    ? (lastPositiveLimits[selected.value] ?? "1")
    : "0";
  value.contentReviewEnabled = checked;
  invalidate();
}
function contentLimitChanged() {
  const value = draft.value;
  if (!value || !contentEditable.value) return;
  if (contentLimitValid.value) {
    const enabled = Number(value.contentRepairLimitRaw) > 0;
    value.contentReviewEnabled = enabled;
    if (enabled)
      lastPositiveLimits[selected.value] = value.contentRepairLimitRaw;
  }
  invalidate();
}
function selectGroup(code: GroupCode) {
  if (code === selected.value) return;
  invalidate(selected.value);
  selected.value = code;
}
function initialize() {
  for (const group of admin.state.value.groups) {
    const value = groupValue(group);
    drafts[group.code] = value;
    baselines[group.code] = clone(value);
    editRevisions[group.code] = 0;
    if (group.contentRepairLimit > 0)
      lastPositiveLimits[group.code] = String(group.contentRepairLimit);
  }
}
async function refreshPortabilityHost() {
  await Promise.all([admin.loadGroups(), admin.loadModels()]);
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
  if (!contentLimitValid.value) return;
  const contentRepairLimit = Number(value.contentRepairLimitRaw);
  const input: GroupDraft = {
    ...value,
    contentReviewEnabled: contentRepairLimit > 0,
    contentRepairLimit,
    modelIds: [...value.modelIds],
    allowedLengths: [...value.allowedLengths],
  };
  Reflect.deleteProperty(
    input as unknown as Record<string, unknown>,
    "contentRepairLimitRaw",
  );
  const editRevision = editRevisions[code] ?? 0;
  const impact = await admin.previewGroup(code, input);
  if (
    impact &&
    selected.value === code &&
    editRevision === (editRevisions[code] ?? 0)
  )
    pending.value = { code, input, impact, editRevision };
  else if (!impact) await reconcile(code);
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
  if (
    !intent ||
    selected.value !== intent.code ||
    (editRevisions[intent.code] ?? 0) !== intent.editRevision
  )
    return;
  try {
    await admin.saveGroup(intent.code, intent.input);
    pending.value = null;
    await admin.loadGroups();
    for (const group of admin.state.value.groups) {
      const fresh = groupValue(group),
        local = drafts[group.code],
        baseline = baselines[group.code];
      if (group.code === intent.code) {
        drafts[group.code] = fresh;
        baselines[group.code] = clone(fresh);
        editRevisions[group.code] = 0;
        if (group.contentRepairLimit > 0)
          lastPositiveLimits[group.code] = String(group.contentRepairLimit);
        Reflect.deleteProperty(remotes, group.code);
      } else if (local && baseline) {
        const localAtBaselineRevision = {
          ...local,
          expectedRevision: baseline.expectedRevision,
        };
        if (
          JSON.stringify(localAtBaselineRevision) === JSON.stringify(baseline)
        ) {
          drafts[group.code] = fresh;
          Reflect.deleteProperty(remotes, group.code);
        } else {
          drafts[group.code] = {
            ...local,
            expectedRevision: fresh.expectedRevision,
          };
        }
        baselines[group.code] = clone(fresh);
      }
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
      <div class="actions">
        <ConfigPortabilityActions
          category="plans"
          :refresh="refreshPortabilityHost"
        />
        <button class="btn" :disabled="busy || !draft" @click="openPriorities">
          {{ copy("priority") }}
        </button>
      </div>
    </div>
    <AppError :failure="failure ?? admin.state.value.failure" />
    <div class="tabs">
      <button
        v-for="group in admin.state.value.groups"
        :key="group.code"
        class="btn"
        :class="{ selected: selected === group.code }"
        :disabled="busy"
        @click="selectGroup(group.code)"
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
      <div>
        <dt>{{ copy("m003.review.title") }}</dt>
        <dd>
          {{
            remotes[selected]!.contentReviewEnabled
              ? remotes[selected]!.contentRepairLimitRaw
              : "0"
          }}
        </dd>
      </div>
    </dl>
    <form
      v-if="draft"
      class="panel m003-page"
      @input="invalidate()"
      @change="invalidate()"
      @submit.prevent="preview"
    >
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
        <section id="service-settings" class="m003-service-settings">
          <div class="section-head">
            <div>
              <h2>{{ copy("m003.service.title") }}</h2>
              <p class="muted">{{ copy("m003.review.rule") }}</p>
            </div>
            <span class="pill">{{
              copy(
                contentEnabled ? "m003.service.enhanced" : "m003.service.basic",
              )
            }}</span>
          </div>
          <div class="form-grid">
            <label class="field"
              ><span>{{ copy("m003.basic.budget") }}</span
              ><input
                :value="
                  admin.state.value.groups.find(
                    (group) => group.code === selected,
                  )?.nativeCorrectionPolicy.maxCalls ?? 2
                "
                readonly
                disabled
              /><small>{{ copy("m003.basic.readonly") }}</small></label
            >
            <div>
              <label class="field inline"
                ><input
                  id="content-review-enabled"
                  type="checkbox"
                  :checked="contentEnabled"
                  :disabled="!contentEditable"
                  @change="toggleContent"
                /><span>{{ copy("m003.review.title") }}</span></label
              >
              <label class="field"
                ><span>{{ copy("m003.review.limit") }}</span
                ><input
                  id="content-repair-limit"
                  v-model="draft.contentRepairLimitRaw"
                  inputmode="numeric"
                  :disabled="!contentEditable"
                  :aria-invalid="!contentLimitValid"
                  @input.stop="contentLimitChanged"
                /><small>{{ copy("m003.review.help") }}</small></label
              >
              <p v-if="!contentLimitValid" class="notice error" role="alert">
                {{ copy("m003.review.invalid") }}
              </p>
            </div>
          </div>
        </section>
        <div class="form-footer">
          <button
            class="btn primary"
            type="submit"
            :disabled="!contentLimitValid"
          >
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
          {{
            copy("m003.impact", {
              basic: pending.impact.baseUsers,
              trial: pending.impact.activeTrialUsers,
            })
          }}
        </p>
        <p>
          {{ copy("a.plan." + pending.code) }} · {{ copy("priority") }}
          {{ pending.input.priority }}
        </p>
        <dl class="admin-facts">
          <div>
            <dt>{{ copy("m003.current") }}</dt>
            <dd>
              {{
                pending.impact.contentServiceChange.before.contentRepairLimit
              }}
            </dd>
          </div>
          <div>
            <dt>{{ copy("m003.after") }}</dt>
            <dd>
              {{ pending.impact.contentServiceChange.after.contentRepairLimit }}
            </dd>
          </div>
        </dl>
        <p v-if="pending.impact.warnings.length" class="notice warn">
          {{ pending.impact.warnings.join(" · ") }}
        </p>
        <p class="muted">
          {{ copy("m003.effect.new") }} {{ copy("m003.effect.inflight") }}
          {{ copy("m003.effect.usage") }}
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
      id="priority-editor"
      :open="prioritiesOpen"
      :title="copy('priority')"
      :backdrop-close-disabled="true"
      initial-focus="input"
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
      <template v-if="priorityImpact">
        <p class="notice">{{ copy("plan.effect") }}</p>
        <p>
          {{
            copy("m003.impact", {
              basic: priorityImpact.affectedBaseUsers,
              trial: priorityImpact.affectedTrialUsers,
            })
          }}
        </p>
        <dl class="admin-facts">
          <div
            v-for="service in priorityImpact.contentServiceByPlan"
            :key="service.code"
          >
            <dt>{{ copy("a.plan." + service.code) }}</dt>
            <dd>
              {{
                service.contentReviewEnabled
                  ? service.contentRepairLimit
                  : copy("m003.service.basic")
              }}
            </dd>
          </div>
        </dl>
        <p v-if="priorityImpact.mayChangeContentService" class="notice warn">
          {{ copy("m003.service.desc") }}
        </p>
        <p class="muted">
          {{ copy("m003.effect.new") }} {{ copy("m003.effect.inflight") }}
          {{ copy("m003.effect.usage") }}
        </p> </template
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
