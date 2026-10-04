<script setup lang="ts">
import { useLearnerAccess } from "@presentation/controllers/learner-access";
definePageMeta({ middleware: "learner" });
const access = useLearnerAccess(),
  library = useLibraryStore(),
  session = useSessionStore(),
  route = useRoute(),
  { copy } = useDesignCopy(),
  format = useDisplayFormatters();
const id = String(route.params.batchId),
  batch = computed(() => library.state.value.details[id]);
const title = ref(""),
  revision = ref(""),
  editing = ref(false),
  busy = ref(false),
  titleError = ref(""),
  deleteOpen = ref(false);
const titleInput = ref<HTMLInputElement | null>(null);
const returnTo = computed(() => ({
  path: "/library",
  query:
    typeof route.query.entry === "string" ? { entry: route.query.entry } : {},
}));
await access.initialize(() =>
  usePageLoader(`batch:${id}`, () => library.loadDetail(id)),
);
useLocalizedHead("library.detail");
function edit() {
  title.value = batch.value?.title ?? "";
  revision.value = batch.value?.titleRevision ?? "";
  editing.value = true;
  titleError.value = "";
  nextTick(() => titleInput.value?.focus());
}
async function saveTitle() {
  if (!batch.value || busy.value) return;
  const value = title.value.trim();
  if (!value) {
    titleError.value = "l.title.empty";
    return;
  }
  if (Array.from(value).length > batch.value.titleMaxLength) {
    titleError.value = "error";
    return;
  }
  const epoch = session.epoch.value;
  busy.value = true;
  try {
    const saved = await library.updateTitle(id, value, revision.value);
    if (epoch !== session.epoch.value || !batch.value) return;
    if (saved) {
      editing.value = false;
      useFeedbackStore().show("l.title.saved");
    } else {
      titleError.value = "l.title.failed";
      revision.value = batch.value.titleRevision;
    }
  } finally {
    busy.value = false;
  }
  await nextTick();
  if (epoch === session.epoch.value && batch.value && editing.value)
    titleInput.value?.focus();
}
async function remove() {
  busy.value = true;
  try {
    await library.remove(id);
    await navigateTo(returnTo.value);
  } catch {
    useFeedbackStore().show("failed");
  } finally {
    busy.value = false;
  }
}
async function start() {
  try {
    const sessionId = await library.beginSingleBatch(id);
    await navigateTo({
      path: `/review/${encodeURIComponent(sessionId)}`,
      query: { batch: id, start: "1" },
    });
  } catch {
    useFeedbackStore().show("failed");
  }
}
</script>
<template>
  <LearnerPageBoundary :view="access.view.value" @retry="access.retry"
    ><div class="page-head">
      <div>
        <h1>{{ copy("l.detail") }}</h1>
      </div>
      <NuxtLink class="btn" :to="returnTo">{{
        copy("l.backLibrary")
      }}</NuxtLink>
    </div>
    <AppError :failure="library.state.value.failure" />
    <div v-if="batch" class="batch-detail">
      <article class="panel">
        <p class="eyebrow">{{ format.dateTime(batch.savedAt) }}</p>
        <div v-if="!editing" class="batch-title-header">
          <h2 id="saved-batch-title" class="batch-title">{{ batch.title }}</h2>
          <button class="btn quiet small" @click="edit">
            <AppIcon name="pencil" />{{ copy("l.title.edit") }}
          </button>
        </div>
        <form
          v-else
          class="batch-title-editor"
          :aria-busy="busy"
          @submit.prevent="saveTitle"
        >
          <label class="field"
            ><span>{{ copy("l.title.label") }}</span
            ><input
              id="batch-title"
              ref="titleInput"
              v-model="title"
              :disabled="busy"
              aria-describedby="batch-title-hint"
              :aria-invalid="Boolean(titleError)"
          /></label>
          <p id="batch-title-hint" class="field-help">
            {{ copy("l.title.hint") }}
          </p>
          <p v-if="titleError" class="note error" role="alert">
            {{ copy(titleError)
            }}<template v-if="library.state.value.failure?.kind === 'conflict'">
              {{ batch.title }}</template
            >
          </p>
          <div class="actions">
            <button class="btn primary" type="submit" :disabled="busy">
              {{ copy(busy ? "l.title.saving" : "l.title.save") }}</button
            ><button
              class="btn quiet"
              type="button"
              :disabled="busy"
              @click="editing = false"
            >
              {{ copy("cancel") }}
            </button>
          </div>
        </form>
        <div class="chips">
          <span v-for="tag in batch.tags" :key="tag" class="chip">{{
            tag
          }}</span>
        </div>
        <p class="story-text" lang="en">
          <template
            v-for="(segment, index) in batch.passageSegments"
            :key="index"
            ><mark v-if="segment.kind === 'target'">{{ segment.text }}</mark
            ><template v-else>{{ segment.text }}</template></template
          >
        </p>
        <section class="study-resources">
          <h2>{{ copy("l.resources") }}</h2>
          <div class="resource-grid">
            <article v-for="target in batch.targets" :key="target.entry">
              <h3>{{ target.entry }}</h3>
              <p>{{ target.entryMeaning }}</p>
              <p class="muted">{{ target.hintPhrase }}</p>
            </article>
          </div>
        </section>
      </article>
      <aside>
        <section
          class="panel batch-settings"
          aria-labelledby="batch-settings-title"
        >
          <h2 id="batch-settings-title">
            <AppIcon name="sparkles" />{{ copy("l.snapshot") }}
          </h2>
          <div class="config-fields">
            <GenerationSettings :configuration="batch.configuration" />
          </div>
          <dl class="batch-review-count">
            <div>
              <dt>
                <AppIcon name="clipboard-check" />{{ copy("l.stat.successes") }}
              </dt>
              <dd>{{ batch.reviewSummary.successfulCount }}</dd>
            </div>
          </dl>
        </section>
        <section class="panel">
          <BatchParticipation
            :batch-id="id"
            :value="batch.participatesInRangeReview"
          />
          <p class="muted">{{ copy("l.participate.desc") }}</p>
          <div class="actions">
            <button class="btn primary" @click="start">
              {{ copy("l.single") }}</button
            ><button class="btn danger" @click="deleteOpen = true">
              {{ copy("l.delete") }}
            </button>
          </div>
        </section>
      </aside>
    </div>
    <div v-else class="empty">
      <h2>{{ copy("l.unavailable") }}</h2>
      <p>{{ copy("l.unavailable.desc") }}</p>
      <button class="btn" @click="library.loadDetail(id, true)">
        {{ copy("retry") }}
      </button>
    </div>
    <AppDialog
      id="delete-batch-detail"
      :open="deleteOpen"
      :title="copy('l.delete.title')"
      @close="deleteOpen = false"
      ><p>{{ copy("l.delete.desc") }}</p>
      <template #footer
        ><button class="btn" :disabled="busy" @click="deleteOpen = false">
          {{ copy("cancel") }}</button
        ><button class="btn danger" :disabled="busy" @click="remove">
          {{ copy("l.delete") }}
        </button></template
      ></AppDialog
    ></LearnerPageBoundary
  >
</template>
