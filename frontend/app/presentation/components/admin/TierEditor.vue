<script setup lang="ts">
import { useAdminGrowthStore } from "@runtime/stores/admin-growth";
import { useAdminItemsStore } from "@runtime/stores/admin-items";
import {
  validateLevels,
  validateAchievements,
  levelChanges,
  achievementChanges,
  issueKeys,
  mergeEdited,
} from "@application/admin/growth-drafts";
import type {
  LevelConfigurationModel,
  AchievementConfigurationModel,
  LevelInputModel,
  AchievementFieldsModel,
  LevelChangesModel,
  AchievementChangesModel,
  LevelImpactModel,
  SavedRowModel,
} from "@application/admin/growth";
import type { AchievementKind } from "@application/growth/models";
import type { Bilingual } from "@application/admin/notices";
import type { AppFailure } from "@application/shared/models";
import { normalizeFailure } from "@application/shared/failure";
const props = defineProps<{ kind: "levels" | AchievementKind }>(),
  emit = defineEmits<{ busy: [value: boolean] }>();
const growth = useAdminGrowthStore(),
  items = useAdminItemsStore(),
  session = useSessionStore(),
  { copy, language } = useDesignCopy();
const isLevel = computed(() => props.kind === "levels");
type Row = {
  clientKey: string;
  id: string | null;
  levelNumber: number;
  threshold: string;
  points: string;
  experience: string;
  itemDefinitionId: string | null;
  itemCount: string;
  enabled: boolean;
  nameText: Bilingual;
  honorText: Bilingual;
  descriptionText: Bilingual;
};
type Configuration = LevelConfigurationModel | AchievementConfigurationModel;
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const blankText = (): Bilingual => ({ zh: null, en: null });
function rowsFrom(config: Configuration | null): Row[] {
  return (
    config?.items.map((r, index) => ({
      clientKey: "",
      id: r.id,
      levelNumber: "levelNumber" in r ? r.levelNumber : index + 1,
      threshold: "levelNumber" in r ? r.minExperience : String(r.threshold),
      points: r.reward.points,
      experience: "experience" in r.reward ? r.reward.experience : "0",
      itemDefinitionId: r.reward.itemDefinitionId,
      itemCount: String(r.reward.itemCount),
      enabled: "rewardEnabled" in r ? r.rewardEnabled : r.enabled,
      nameText: "nameText" in r ? clone(r.nameText) : blankText(),
      honorText: "honorText" in r ? clone(r.honorText) : blankText(),
      descriptionText:
        "descriptionText" in r ? clone(r.descriptionText) : blankText(),
    })) ?? []
  );
}
const configuration = (): Configuration | null => {
  const value =
    props.kind === "levels"
      ? growth.state.value.levels
      : (growth.state.value.achievements[props.kind] ?? null);
  return value ? (JSON.parse(JSON.stringify(value)) as Configuration) : null;
};
const baseline = ref<Configuration | null>(clone(configuration())),
  rows = ref<Row[]>(rowsFrom(baseline.value)),
  remote = ref<Configuration | null>(null),
  filter = ref(""),
  busy = ref(false),
  failure = shallowRef<AppFailure | null>(null),
  invalid = ref(false),
  reconciling = ref(false),
  unknownNew = ref(false),
  issues = ref<Record<string, string[]>>({});
const submission = shallowRef<
    LevelChangesModel | AchievementChangesModel | null
  >(null),
  impact = shallowRef<LevelImpactModel | null>(null),
  content = ref<{
    clientKey: string;
    nameText: Bilingual;
    honorText: Bilingual;
    descriptionText: Bilingual;
  } | null>(null);
const label = (r: Row) =>
  isLevel.value
    ? "Lv. " + r.levelNumber
    : r.nameText[language.value] ||
      r.nameText[language.value === "zh" ? "en" : "zh"] ||
      copy("a.untitled");
const visible = computed(() =>
  rows.value.filter((r) =>
    label(r).toLocaleLowerCase().includes(filter.value.toLocaleLowerCase()),
  ),
);
const itemName = (item: (typeof items.state.value.items)[number]) =>
  item.name[language.value] ||
  item.name[language.value === "zh" ? "en" : "zh"] ||
  "—";
function keys() {
  for (const row of rows.value)
    if (!row.clientKey) row.clientKey = crypto.randomUUID();
}
onMounted(keys);
function add() {
  keys();
  const initial = isLevel.value && rows.value.length === 0;
  rows.value.push({
    clientKey: crypto.randomUUID(),
    id: null,
    levelNumber: rows.value.length + 1,
    threshold: initial ? "0" : "",
    points: "0",
    experience: "0",
    itemDefinitionId: null,
    itemCount: "0",
    enabled: !initial,
    nameText: blankText(),
    honorText: blankText(),
    descriptionText: blankText(),
  });
  filter.value = "";
}
const levelValue = (r: Row): LevelInputModel => ({
  levelNumber: r.levelNumber,
  minExperience: r.threshold,
  rewardEnabled: r.enabled,
  reward: {
    points: r.points,
    itemDefinitionId: r.itemDefinitionId,
    itemCount: r.itemDefinitionId ? Number(r.itemCount) : 0,
  },
});
const achievementValue = (r: Row): AchievementFieldsModel => ({
  threshold: Number(r.threshold),
  enabled: r.enabled,
  nameText: clone(r.nameText),
  honorText: clone(r.honorText),
  descriptionText: clone(r.descriptionText),
  reward: {
    points: r.points,
    experience: r.experience,
    itemDefinitionId: r.itemDefinitionId,
    itemCount: r.itemDefinitionId ? Number(r.itemCount) : 0,
  },
});
function changeCard(row: Row) {
  row.itemCount = row.itemDefinitionId ? "1" : "0";
}
function openContent(row: Row) {
  content.value = {
    clientKey: row.clientKey,
    nameText: clone(row.nameText),
    honorText: clone(row.honorText),
    descriptionText: clone(row.descriptionText),
  };
}
function saveContent() {
  const value = content.value;
  if (!value) return;
  const row = rows.value.find((r) => r.clientKey === value.clientKey);
  if (row) {
    row.nameText = clone(value.nameText);
    row.honorText = clone(value.honorText);
    row.descriptionText = clone(value.descriptionText);
  }
  content.value = null;
}
async function reread() {
  const epoch = session.epoch.value;
  await growth.read(props.kind);
  if (epoch !== session.epoch.value) return;
  if (!growth.state.value.failures[props.kind]) {
    remote.value = clone(configuration());
    reconciling.value = false;
  }
}
function acceptRemote() {
  if (!remote.value || !baseline.value) return;
  const original = rowsFrom(baseline.value),
    fresh = rowsFrom(remote.value);
  rows.value = rows.value.map((row) => {
    if (!row.id) return row;
    const before = original.find((r) => r.id === row.id),
      now = fresh.find((r) => r.id === row.id);
    return before && now
      ? { ...mergeEdited(before, clone(row), now), clientKey: row.clientKey }
      : row;
  });
  for (const row of fresh)
    if (!rows.value.some((r) => r.id === row.id))
      rows.value.push({ ...row, clientKey: crypto.randomUUID() });
  rows.value.sort((a, b) =>
    isLevel.value
      ? a.levelNumber - b.levelNumber
      : Number(a.threshold) - Number(b.threshold),
  );
  baseline.value = remote.value;
  remote.value = null;
}
async function failed(error: unknown, mayHaveWritten = true) {
  failure.value = normalizeFailure(error);
  impact.value = null;
  growth.clearLevelPreview();
  issues.value = issueKeys(
    failure.value.fields,
    submission.value?.changes ?? [],
  );
  const first = Object.keys(issues.value)[0];
  if (first) {
    filter.value = "";
    await nextTick();
    const row = rows.value.find((r) => r.clientKey === first);
    if (
      row &&
      issues.value[first]?.some((p) =>
        /^\/(value\/)?(name|title|description|honor)/.test(p),
      )
    ) {
      openContent(row);
      await nextTick();
      document
        .querySelector<HTMLElement>("#tier-content [aria-invalid=true]")
        ?.focus();
    } else
      document
        .querySelector<HTMLElement>(
          `[data-tier-key="${CSS.escape(first)}"] input[aria-invalid=true]`,
        )
        ?.focus();
  }
  if (
    failure.value.status === 409 ||
    failure.value.status === null ||
    (failure.value.status ?? 0) >= 500
  ) {
    reconciling.value = true;
    unknownNew.value =
      mayHaveWritten &&
      (failure.value.status === null || (failure.value.status ?? 0) >= 500) &&
      !!submission.value?.changes.some((c) => c.id === null);
    await reread();
  }
}
function apply(config: Configuration, savedRows: SavedRowModel[]) {
  const keyById = new Map(
    rows.value.filter((r) => r.id).map((r) => [r.id, r.clientKey]),
  );
  for (const row of savedRows) keyById.set(row.id, row.clientKey);
  baseline.value = clone(config);
  rows.value = rowsFrom(config).map((r) => ({
    ...r,
    clientKey: keyById.get(r.id) ?? crypto.randomUUID(),
  }));
  remote.value = null;
  submission.value = null;
  impact.value = null;
  issues.value = {};
  unknownNew.value = false;
}
async function save() {
  if (busy.value || reconciling.value || unknownNew.value || !baseline.value)
    return;
  keys();
  if (remote.value) acceptRemote();
  const levelRows = clone(rows.value).map((r) => ({
      clientKey: r.clientKey,
      id: r.id,
      value: levelValue(r),
    })),
    achievementRows = clone(rows.value).map((r) => ({
      clientKey: r.clientKey,
      id: r.id,
      value: achievementValue(r),
    }));
  invalid.value = isLevel.value
    ? !validateLevels(levelRows)
    : !rows.value.every((r) => /^[1-9]\d*$/.test(r.threshold)) ||
      !validateAchievements(achievementRows);
  if (invalid.value) return;
  const intent =
    props.kind === "levels"
      ? levelChanges(
          levelRows,
          baseline.value.items as LevelConfigurationModel["items"],
          baseline.value.revision,
        )
      : achievementChanges(
          props.kind,
          achievementRows,
          baseline.value.items as AchievementConfigurationModel["items"],
          baseline.value.revision,
        );
  if (!intent.changes.length) return;
  submission.value = intent;
  const epoch = session.epoch.value;
  busy.value = true;
  emit("busy", true);
  failure.value = null;
  issues.value = {};
  try {
    if ("kind" in intent) {
      const saved = await growth.saveAchievements(intent);
      if (epoch === session.epoch.value && saved)
        apply(saved.configuration, saved.savedRows);
    } else {
      const result = await growth.previewLevels(intent);
      if (epoch === session.epoch.value) impact.value = result;
    }
  } catch (error) {
    if (epoch === session.epoch.value) await failed(error, "kind" in intent);
  } finally {
    if (epoch === session.epoch.value) {
      busy.value = false;
      emit("busy", impact.value !== null);
    }
  }
}
async function confirm() {
  const intent = submission.value;
  if (!impact.value || !intent || "kind" in intent) return;
  const epoch = session.epoch.value;
  busy.value = true;
  try {
    const saved = await growth.saveLevels(intent);
    if (epoch === session.epoch.value && saved)
      apply(saved.configuration, saved.savedRows);
  } catch (error) {
    if (epoch === session.epoch.value) await failed(error);
  } finally {
    if (epoch === session.epoch.value) {
      busy.value = false;
      emit("busy", false);
    }
  }
}
function cancel() {
  if (busy.value) return;
  impact.value = null;
  growth.clearLevelPreview();
  emit("busy", false);
}
function resolveNew() {
  if (!remote.value) return;
  rows.value = rows.value.filter((r) => r.id !== null);
  unknownNew.value = false;
  acceptRemote();
}
function invalidContent(field: string, locale: string) {
  const key = {
    nameText: "name",
    descriptionText: "description",
    honorText: "honor",
  }[field];
  return (
    !!content.value &&
    !!key &&
    (issues.value[content.value.clientKey]?.some(
      (p) =>
        p.includes("/" + key) &&
        (p.endsWith("/" + locale) || !p.match(/\/(zh|en)$/)),
    ) ??
      false)
  );
}
function invalidField(row: Row, key: string) {
  return (
    issues.value[row.clientKey]?.some((p) => p.startsWith("/value/" + key)) ??
    false
  );
}
watch(session.epoch, () => {
  rows.value = [];
  baseline.value = null;
  remote.value = null;
  content.value = null;
  submission.value = null;
  impact.value = null;
  failure.value = null;
  growth.clearLevelPreview();
  emit("busy", false);
});
onBeforeUnmount(() => growth.clearLevelPreview());
</script>
<template>
  <form @submit.prevent="save">
    <p class="muted">
      {{ copy(isLevel ? "level.effect" : "achievement.effect") }}
    </p>
    <p v-if="isLevel" class="notice">{{ copy("a.level.initial") }}</p>
    <AppError :failure="failure" />
    <p v-if="invalid" class="notice error" role="alert">
      {{ copy("a.tier.order") }}
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
    <div v-if="remote" class="table-wrap">
      <table class="data-table">
        <thead>
          <tr>
            <th>{{ copy("a.tier") }}</th>
            <th>{{ copy("threshold") }}</th>
            <th>{{ copy("rewardpoints") }}</th>
            <th>{{ copy("rewardxp") }}</th>
            <th>{{ copy("itemsettings") }}</th>
            <th>{{ copy("enabled") }}</th>
            <th>{{ copy("a.tier.content") }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in rowsFrom(remote)" :key="row.id ?? row.clientKey">
            <td>{{ label(row) }}</td>
            <td>{{ row.threshold }}</td>
            <td>{{ row.points }}</td>
            <td>{{ row.experience }}</td>
            <td>
              {{
                items.state.value.items.find(
                  (i) => i.id === row.itemDefinitionId,
                )
                  ? itemName(
                      items.state.value.items.find(
                        (i) => i.id === row.itemDefinitionId,
                      )!,
                    )
                  : "—"
              }}
              × {{ row.itemCount }}
            </td>
            <td>{{ copy(row.enabled ? "enabled" : "disabled") }}</td>
            <td>
              <dl>
                <template v-for="locale in ['zh', 'en'] as const" :key="locale"
                  ><dt>{{ copy("a.tier.title." + locale) }}</dt>
                  <dd>{{ row.nameText[locale] ?? "—" }}</dd>
                  <dt>{{ copy("a.tier.description." + locale) }}</dt>
                  <dd class="preserve-lines">
                    {{ row.descriptionText[locale] ?? "—" }}
                  </dd>
                  <dt>{{ copy("a.tier.honor." + locale) }}</dt>
                  <dd>{{ row.honorText[locale] ?? "—" }}</dd></template
                >
              </dl>
            </td>
          </tr>
        </tbody>
      </table>
      <button v-if="unknownNew" class="btn" type="button" @click="resolveNew">
        {{ copy("cancel") }}
      </button>
    </div>
    <fieldset :disabled="busy || impact !== null || reconciling">
      <div class="toolbar">
        <label class="field"
          ><span>{{ copy("a.tier.search") }}</span
          ><input v-model="filter" type="search" /></label
        ><button class="btn" type="button" :disabled="unknownNew" @click="add">
          {{ copy("addtier") }}
        </button>
      </div>
      <div class="table-wrap" tabindex="0">
        <table class="data-table tier-table">
          <thead>
            <tr>
              <th>{{ copy("a.tier") }}</th>
              <th>{{ copy("threshold") }}</th>
              <th>{{ copy("rewardpoints") }}</th>
              <th v-if="!isLevel">{{ copy("rewardxp") }}</th>
              <th>{{ copy("rewardcard") }}</th>
              <th>{{ copy("a.quantity") }}</th>
              <th>{{ copy("enabled") }}</th>
              <th>{{ copy("edit") }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in visible"
              :key="row.id ?? row.clientKey"
              :data-tier-key="row.clientKey"
            >
              <td>{{ label(row) }}</td>
              <td>
                <input
                  v-model="row.threshold"
                  :aria-label="copy('threshold') + ' ' + row.levelNumber"
                  inputmode="numeric"
                  pattern="0|[1-9][0-9]*"
                  required
                  :disabled="isLevel && row.levelNumber === 1"
                  :aria-invalid="
                    invalidField(row, isLevel ? 'min_experience' : 'threshold')
                  "
                />
              </td>
              <td>
                <input
                  v-model="row.points"
                  :aria-label="copy('rewardpoints') + ' ' + row.levelNumber"
                  inputmode="numeric"
                  pattern="0|[1-9][0-9]*"
                  required
                  :disabled="isLevel && row.levelNumber === 1"
                  :aria-invalid="invalidField(row, 'reward/points')"
                />
              </td>
              <td v-if="!isLevel">
                <input
                  v-model="row.experience"
                  :aria-label="copy('rewardxp') + ' ' + row.levelNumber"
                  inputmode="numeric"
                  pattern="0|[1-9][0-9]*"
                  required
                  :aria-invalid="invalidField(row, 'reward/experience')"
                />
              </td>
              <td>
                <AppSelect
                  v-model="row.itemDefinitionId"
                  :aria-label="copy('rewardcard') + ' ' + row.levelNumber"
                  :disabled="isLevel && row.levelNumber === 1"
                  :aria-invalid="invalidField(row, 'reward')"
                  @change="changeCard(row)"
                >
                  <option :value="null">—</option>
                  <option
                    v-for="item in items.state.value.items"
                    :key="item.id"
                    :value="item.id"
                  >
                    {{ itemName(item)
                    }}{{ item.listed ? "" : " · " + copy("unlisted") }}
                  </option>
                </AppSelect>
              </td>
              <td>
                <input
                  v-model="row.itemCount"
                  :aria-label="copy('a.quantity') + ' ' + row.levelNumber"
                  type="number"
                  min="1"
                  max="2147483647"
                  step="1"
                  :disabled="
                    !row.itemDefinitionId || (isLevel && row.levelNumber === 1)
                  "
                  :aria-invalid="invalidField(row, 'reward/item_count')"
                />
              </td>
              <td>
                <input
                  v-model="row.enabled"
                  :aria-label="copy('enabled') + ' ' + row.levelNumber"
                  type="checkbox"
                  :disabled="isLevel && row.levelNumber === 1"
                />
              </td>
              <td>
                <button
                  v-if="!isLevel"
                  class="btn small"
                  type="button"
                  @click="openContent(row)"
                >
                  {{ copy("a.tier.content") }}</button
                ><span v-else>—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="actions form-footer">
        <button class="btn primary" :disabled="unknownNew" type="submit">
          {{ copy("save") }}
        </button>
      </div>
    </fieldset>
    <AppDialog
      id="tier-content"
      :open="content !== null"
      :title="copy('a.tier.content')"
      @close="content = null"
      ><template v-if="content"
        ><div
          v-for="pair in [
            { field: 'nameText', key: 'title' },
            { field: 'descriptionText', key: 'description' },
            { field: 'honorText', key: 'honor' },
          ] as const"
          :key="pair.field"
          class="form-grid"
        >
          <label
            v-for="locale in ['zh', 'en'] as const"
            :key="locale"
            class="field"
            ><span>{{ copy("a.tier." + pair.key + "." + locale) }}</span
            ><textarea
              v-if="pair.field === 'descriptionText'"
              v-model="content[pair.field][locale]"
              :aria-invalid="invalidContent(pair.field, locale)" /><input
              v-else
              v-model="content[pair.field][locale]"
              :aria-invalid="invalidContent(pair.field, locale)"
          /></label>
        </div>
        <p class="notice">{{ copy("a.honor.rule") }}</p></template
      ><template #footer
        ><button class="btn" type="button" @click="content = null">
          {{ copy("cancel") }}</button
        ><button class="btn primary" type="button" @click="saveContent">
          {{ copy("save") }}
        </button></template
      ></AppDialog
    >
    <AppDialog
      id="levels-impact"
      :open="impact !== null"
      :title="copy('a.level.confirm')"
      @close="cancel"
      ><p class="notice warn">{{ copy("level.effect") }}</p>
      <p v-if="impact">{{ copy("a.users") }} · {{ impact.affectedUsers }}</p>
      <AppError :failure="failure" /><template #footer
        ><button class="btn" type="button" :disabled="busy" @click="cancel">
          {{ copy("cancel") }}</button
        ><button
          class="btn primary"
          type="button"
          :disabled="busy"
          @click="confirm"
        >
          {{ copy("confirm") }}
        </button></template
      ></AppDialog
    >
  </form>
</template>
