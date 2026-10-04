<script setup lang="ts">
import { useAdminGrowthStore } from "@runtime/stores/admin-growth";
import { validSettings, mergeEdited } from "@application/admin/growth-drafts";
import type {
  GrowthSettingsModel,
  GrowthSettingsInput,
} from "@application/admin/growth";
import type { AppFailure } from "@application/shared/models";
import { normalizeFailure } from "@application/shared/failure";
const emit = defineEmits<{ busy: [value: boolean] }>();
const growth = useAdminGrowthStore(),
  session = useSessionStore(),
  { copy } = useDesignCopy();
type Values = Omit<GrowthSettingsInput, "expectedRevision">;
const values = (model: GrowthSettingsModel | null): Values => {
  const rule = model?.pending ?? model?.current;
  return {
    masteryExperience: model?.masteryExperience ?? "",
    basePoints: rule?.basePoints ?? "",
    stepPoints: rule?.stepPoints ?? "",
    capPoints: rule?.capPoints ?? "",
    normalExperience: rule?.normalExperience ?? "",
  };
};
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const baseline = ref<GrowthSettingsModel | null>(
    clone(growth.state.value.settings),
  ),
  draft = ref(values(baseline.value)),
  remote = ref<GrowthSettingsModel | null>(null),
  busy = ref(false),
  failure = shallowRef<AppFailure | null>(null),
  reconciling = ref(false),
  invalid = ref(false);
const fields = [
  { key: "basePoints", label: "rewardpoints", wire: "base_points" },
  { key: "stepPoints", label: "increment", wire: "step_points" },
  { key: "capPoints", label: "cap", wire: "cap_points" },
  { key: "normalExperience", label: "rewardxp", wire: "normal_experience" },
  { key: "masteryExperience", label: "firstxp", wire: "mastery_experience" },
] as const;
async function reread() {
  const epoch = session.epoch.value;
  await growth.read("settings");
  if (epoch !== session.epoch.value) return;
  if (!growth.state.value.failures.settings && growth.state.value.settings) {
    remote.value = clone(growth.state.value.settings);
    reconciling.value = false;
  }
}
async function save() {
  if (busy.value || reconciling.value || !baseline.value) return;
  invalid.value = !validSettings(draft.value);
  if (invalid.value) return;
  const epoch = session.epoch.value;
  busy.value = true;
  emit("busy", true);
  failure.value = null;
  try {
    if (remote.value) {
      draft.value = mergeEdited(
        values(baseline.value),
        clone(draft.value),
        values(remote.value),
      );
      baseline.value = remote.value;
      remote.value = null;
    }
    const saved = await growth.saveSettings({
      ...draft.value,
      expectedRevision: baseline.value.revision,
    });
    if (epoch !== session.epoch.value) return;
    if (saved) {
      baseline.value = clone(saved);
      draft.value = values(saved);
    }
  } catch (error) {
    if (epoch !== session.epoch.value) return;
    failure.value = normalizeFailure(error);
    if (
      failure.value.status === 409 ||
      failure.value.status === null ||
      (failure.value.status ?? 0) >= 500
    ) {
      reconciling.value = true;
      await reread();
    }
  } finally {
    if (epoch === session.epoch.value) {
      busy.value = false;
      emit("busy", false);
    }
  }
}
watch(session.epoch, () => {
  baseline.value = null;
  remote.value = null;
  draft.value = values(null);
  failure.value = null;
  emit("busy", false);
});
</script>
<template>
  <form @submit.prevent="save">
    <p class="muted">
      {{ copy("sign.effect")
      }}<template v-if="baseline?.pending">
        · {{ baseline.pending.effectiveDay }}</template
      >
    </p>
    <AppError
      :failure="failure ?? growth.state.value.failures.settings ?? null"
    />
    <p v-if="invalid" class="notice error" role="alert">
      {{ copy("a.sign.invalid") }}
    </p>
    <button
      v-if="reconciling"
      class="btn"
      type="button"
      :disabled="busy"
      @click="reread"
    >
      {{ copy("retry") }}
    </button>
    <dl v-if="remote" class="admin-facts">
      <div v-for="field in fields" :key="field.key">
        <dt>{{ copy(field.label) }}</dt>
        <dd>{{ values(remote)[field.key] }}</dd>
      </div>
    </dl>
    <fieldset :disabled="busy || !baseline">
      <div class="form-grid">
        <label v-for="field in fields" :key="field.key" class="field"
          ><span>{{ copy(field.label) }}</span
          ><input
            v-model="draft[field.key]"
            inputmode="numeric"
            pattern="0|[1-9][0-9]*"
            required
            :aria-invalid="!!failure?.fields['/' + field.wire]"
        /></label>
      </div>
      <div class="form-footer">
        <button class="btn primary" :disabled="reconciling" type="submit">
          {{ copy("save") }}
        </button>
      </div>
    </fieldset>
  </form>
</template>
