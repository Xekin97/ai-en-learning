<script setup lang="ts">
import {
  useAdminGrowthStore,
  achievementKinds,
} from "@runtime/stores/admin-growth";
import { useAdminItemsStore } from "@runtime/stores/admin-items";
import CheckinSettings from "@presentation/components/admin/CheckinSettings.vue";
import TierEditor from "@presentation/components/admin/TierEditor.vue";
import ItemDefinitions from "@presentation/components/admin/ItemDefinitions.vue";
import type { AchievementKind } from "@application/growth/models";
import type { ItemReferenceModel } from "@application/admin/items";
definePageMeta({ middleware: "admin", layout: "admin" });
const growth = useAdminGrowthStore(),
  items = useAdminItemsStore(),
  admin = useAdminStore(),
  { copy } = useDesignCopy();
const tab = ref<
    "signsettings" | "levelsettings" | "achievementsettings" | "itemsettings"
  >("itemsettings"),
  kind = ref<AchievementKind>("checkin_streak"),
  busy = ref(false);
const kinds = {
  checkin_streak: "signin",
  review_streak: "nav.range",
  mastered_words: "mastered",
  saved_passages: "stories",
};
await usePageLoader("admin-growth", () =>
  Promise.allSettled([growth.load(), items.load(), admin.loadModels()]).then(
    () => {},
  ),
);
function reference(value: ItemReferenceModel) {
  if (value.kind === "level") tab.value = "levelsettings";
  else {
    const target = achievementKinds.find((kind) =>
      growth.state.value.achievements[kind]?.items.some(
        (r) => r.id === value.id,
      ),
    );
    if (target) {
      kind.value = target;
      tab.value = "achievementsettings";
    }
  }
}
</script>
<template>
  <div>
    <div class="section-head">
      <div>
        <h1>{{ copy("operations") }}</h1>
        <p class="muted">{{ copy("admin.desc") }}</p>
      </div>
    </div>
    <div class="tabs">
      <button
        v-for="key in [
          'signsettings',
          'levelsettings',
          'achievementsettings',
          'itemsettings',
        ] as const"
        :key="key"
        class="btn"
        :class="{ selected: tab === key }"
        :disabled="busy"
        @click="tab = key"
      >
        {{ copy(key) }}
      </button>
    </div>
    <section class="panel">
      <AppError
        v-for="(failure, key) in growth.state.value.failures"
        :key="key"
        :failure="failure ?? null"
      /><button
        v-if="Object.keys(growth.state.value.failures).length"
        class="btn"
        :disabled="busy || growth.state.value.pending"
        @click="growth.load"
      >
        {{ copy("retry") }}</button
      ><label v-if="tab === 'achievementsettings'" class="field"
        ><span>{{ copy("type") }}</span
        ><AppSelect v-model="kind" :disabled="busy">
          <option v-for="key in achievementKinds" :key="key" :value="key">
            {{ copy(kinds[key]) }}
          </option>
        </AppSelect></label
      ><KeepAlive
        ><CheckinSettings
          v-if="tab === 'signsettings' && growth.state.value.settings"
          @busy="busy = $event" /><TierEditor
          v-else-if="tab === 'levelsettings' && growth.state.value.levels"
          key="levels"
          kind="levels"
          @busy="busy = $event" /><TierEditor
          v-else-if="
            tab === 'achievementsettings' &&
            growth.state.value.achievements[kind]
          "
          :key="kind"
          :kind="kind"
          @busy="busy = $event" /><ItemDefinitions
          v-else-if="tab === 'itemsettings'"
          @reference="reference"
          @busy="busy = $event"
      /></KeepAlive>
    </section>
  </div>
</template>
