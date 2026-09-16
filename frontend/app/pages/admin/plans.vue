<script setup lang="ts">
import type { GroupCode, PassageLength } from "@application/shared/models";
import type { AdminPlanDraft } from "@application/admin/plan-policy";
import { presentAdminPlanWarning } from "@presentation/admin/admin-plan-presenter";

definePageMeta({ middleware: "admin", layout: "admin" });
const admin = useAdminStore();
const format = useDisplayFormatters();
const { t } = useI18n();
const lengths: PassageLength[] = ["short", "medium", "long", "xlong"];
const drafts = reactive<Partial<Record<GroupCode, AdminPlanDraft>>>({});
const activeCode = ref<GroupCode>("visitor");
const activeDraft = computed(() => drafts[activeCode.value]);
const warning = computed(() => presentAdminPlanWarning(activeDraft.value, t));

await usePageLoader("admin-groups", async () => {
  await Promise.all([admin.loadGroups(), admin.loadModels()]);
});
syncDrafts();
useLocalizedHead("admin.plans");

function syncDrafts() {
  for (const group of admin.state.value.groups)
    drafts[group.code] = {
      rolling24hLimit:
        group.rolling24hLimit === null ? "" : String(group.rolling24hLimit),
      maxEntries: group.maxEntries,
      allowedLengths: [...group.allowedLengths],
      modelIds: group.models.map((model) => model.id),
    };
}

function toggle<T>(values: T[], value: T) {
  const index = values.indexOf(value);
  if (index >= 0) values.splice(index, 1);
  else values.push(value);
}

async function save(code: GroupCode) {
  const draft = drafts[code];
  if (!draft) return;
  try {
    await admin.saveGroup(code, {
      rolling24hLimit:
        draft.rolling24hLimit === "" ? null : Number(draft.rolling24hLimit),
      maxEntries: Number(draft.maxEntries),
      allowedLengths: [...draft.allowedLengths],
      modelIds: [...draft.modelIds],
    });
    syncDrafts();
  } catch {
    /* rendered by store */
  }
}
</script>

<template>
  <div>
    <header class="page-heading">
      <div>
        <p class="eyebrow">{{ $t("admin.title") }}</p>
        <h1 class="page-title">{{ $t("admin.plans") }}</h1>
        <p class="page-description">{{ $t("admin.plansCopy") }}</p>
      </div>
    </header>
    <AppError :failure="admin.state.value.failure" />
    <section class="card">
      <div class="card-body">
        <div class="tabs" role="tablist" :aria-label="$t('admin.plans')">
          <button
            v-for="group in admin.state.value.groups"
            :key="group.code"
            class="tab"
            role="tab"
            type="button"
            :aria-selected="activeCode === group.code"
            @click="activeCode = group.code"
          >
            {{ format.group(group.code) }}
          </button>
        </div>
        <form
          v-if="activeDraft"
          class="admin-plan-form"
          @submit.prevent="save(activeCode)"
        >
          <div
            v-if="warning"
            class="notice notice-warning admin-plan-warning"
            role="status"
          >
            <AppIcon name="alert" />
            <div>
              <strong class="notice-title">{{ warning.title }}</strong>
              {{ warning.copy }}
            </div>
          </div>
          <div class="admin-grid">
            <section>
              <fieldset class="field admin-available-models">
                <legend class="field-label">
                  {{ $t("admin.availableModels") }}
                </legend>
                <div class="checkbox-list">
                  <label
                    v-for="model in admin.state.value.models"
                    :key="model.id"
                    class="checkbox-row"
                    ><input
                      type="checkbox"
                      :checked="activeDraft.modelIds.includes(model.id)"
                      @change="toggle(activeDraft.modelIds, model.id)"
                    /><span
                      ><strong>{{ model.displayName }}</strong
                      ><span
                        v-if="model.description"
                        class="helper admin-option-copy"
                        >{{ model.description }}</span
                      ></span
                    ></label
                  >
                </div>
              </fieldset>
              <fieldset class="field">
                <legend class="field-label">{{ $t("admin.lengths") }}</legend>
                <div class="chip-list">
                  <label v-for="length in lengths" :key="length" class="chip"
                    ><input
                      type="checkbox"
                      :checked="activeDraft.allowedLengths.includes(length)"
                      @change="toggle(activeDraft.allowedLengths, length)"
                    />
                    {{ format.length(length) }}</label
                  >
                </div>
              </fieldset>
            </section>
            <section>
              <label class="field"
                ><span class="field-label">{{ $t("admin.maxEntries") }}</span
                ><input
                  v-model.number="activeDraft.maxEntries"
                  class="text-input"
                  type="number"
                  min="1"
                  required
              /></label>
              <div class="field">
                <label class="field-label" for="quota-limit">{{
                  $t("admin.limit")
                }}</label
                ><input
                  id="quota-limit"
                  v-model="activeDraft.rolling24hLimit"
                  class="text-input"
                  type="number"
                  min="0"
                  :disabled="activeDraft.rolling24hLimit === ''"
                /><label class="switch admin-unlimited-switch"
                  ><input
                    type="checkbox"
                    :checked="activeDraft.rolling24hLimit === ''"
                    @change="
                      activeDraft.rolling24hLimit = (
                        $event.target as HTMLInputElement
                      ).checked
                        ? ''
                        : '5'
                    "
                  /><span class="switch-track" /><span>{{
                    $t("admin.unlimitedToggle")
                  }}</span></label
                >
              </div>
            </section>
          </div>
        </form>
      </div>
      <footer class="card-footer">
        <button
          class="button button-primary"
          type="button"
          :disabled="!activeDraft"
          @click="save(activeCode)"
        >
          {{ $t("common.saveChanges") }}
        </button>
      </footer>
    </section>
  </div>
</template>
