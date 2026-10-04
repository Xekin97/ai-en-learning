<script setup lang="ts">
import { useLearnerAccess } from "@presentation/controllers/learner-access";

definePageMeta({
  middleware: [
    "learner-login",
    (to, from) => {
      const position = useState<{
        query: string;
        target: string;
        restore: boolean;
      }>("library-position").value;
      // Decide before mounting consumes the saved position. Nuxt otherwise
      // schedules a second scroll to the top after page:loading:end.
      const restore = Boolean(
        position?.restore &&
        from.path === `/library/${position.target}` &&
        position.query ===
          (typeof to.query.entry === "string" ? to.query.entry : ""),
      );
      to.meta.scrollToTop = !restore;
      if (position && !restore) position.restore = false;
    },
  ],
});

const access = useLearnerAccess(),
  library = useLibraryStore(),
  format = useDisplayFormatters(),
  { copy } = useDesignCopy(),
  route = useRoute(),
  feedback = useFeedbackStore();
const query = ref(
    typeof route.query.entry === "string"
      ? route.query.entry
      : library.state.value.query,
  ),
  deleteId = ref<string | null>(null),
  busy = ref(false);
const searchInput = ref<HTMLInputElement | null>(null),
  listElement = ref<HTMLElement | null>(null),
  moreButton = ref<HTMLButtonElement | null>(null);
const stats = computed(() => {
  const s = library.state.value.summary;
  return s
    ? ([
        ["generated", s.generationCount, "notebook-pen"],
        ["words", s.uniqueLearnedEntries, "book-open-text"],
        ["participating", s.participatingBatches, "calendar-check"],
        ["paused", s.pausedBatches, "calendar-days"],
        ["successes", s.successfulReviewCount, "clipboard-check"],
        ["successfulbatches", s.batchesEverReviewedSuccessfully, "check"],
      ] as const)
    : [];
});
const position = usePrivateState("library-position", () => ({
  query: "",
  top: 0,
  target: "",
  restore: false,
}));
await access.initialize(() =>
  usePageLoader("library", () =>
    position.value.restore &&
    position.value.query === query.value &&
    library.state.value.batches.length
      ? Promise.resolve()
      : library.load(query.value),
  ),
);
onBeforeRouteLeave((to) => {
  if (to.path.startsWith("/library/")) {
    position.value = {
      query: query.value,
      top: window.scrollY,
      target: typeof to.params.batchId === "string" ? to.params.batchId : "",
      restore: true,
    };
  } else position.value.restore = false;
});
let restoreFrame: number | undefined;
onBeforeUnmount(() => {
  if (restoreFrame !== undefined) cancelAnimationFrame(restoreFrame);
});
onMounted(async () => {
  if (!position.value.restore || position.value.query !== query.value) return;
  await nextTick();
  restoreFrame = requestAnimationFrame(() => {
    document
      .querySelector<HTMLElement>(
        `[data-batch="${CSS.escape(position.value.target)}"] h2 a`,
      )
      ?.focus({ preventScroll: true });
    window.scrollTo({ top: position.value.top, behavior: "instant" });
    position.value.restore = false;
  });
});
useLocalizedHead("common.library");
async function search() {
  await navigateTo({
    path: "/library",
    query: query.value ? { entry: query.value } : {},
  });
  await library.load(query.value);
  await nextTick();
  searchInput.value?.focus({ preventScroll: true });
}
async function loadMore() {
  if (library.state.value.loadingMore) return;
  const request = library.state.value.request;
  const existing = new Set(
    library.state.value.batches.map((batch) => batch.id),
  );
  await library.loadMore();
  await nextTick();
  if (request !== library.state.value.request) return;
  const added = library.state.value.batches.find(
    (batch) => !existing.has(batch.id),
  );
  if (added) {
    listElement.value
      ?.querySelector<HTMLElement>(
        `[data-batch="${CSS.escape(added.id)}"] h2 a`,
      )
      ?.focus();
  } else moreButton.value?.focus({ preventScroll: true });
}
async function start(id: string) {
  try {
    const sessionId = await library.beginSingleBatch(id);
    await navigateTo({
      path: `/review/${encodeURIComponent(sessionId)}`,
      query: { batch: id, start: "1" },
    });
  } catch {
    feedback.show("failed");
  }
}
async function remove() {
  if (!deleteId.value || busy.value) return;
  busy.value = true;
  try {
    await library.remove(deleteId.value);
    deleteId.value = null;
    feedback.show("l.deleted");
  } catch {
    feedback.show("failed");
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <LearnerPageBoundary :view="access.view.value" @retry="access.retry"
    ><div class="library-page">
      <div class="page-head">
        <div>
          <h1>{{ copy("l.library") }}</h1>
          <p>{{ copy("l.library.desc") }}</p>
        </div>
        <NuxtLink class="btn primary" to="/review"
          ><AppIcon name="calendar-days" />{{ copy("l.dateReview") }}</NuxtLink
        >
      </div>
      <AppError :failure="library.state.value.failure" />
      <dl v-if="stats.length" class="library-stats">
        <div v-for="[key, value, icon] in stats" :key="key" :data-stat="key">
          <dt>
            <AppIcon :name="icon" /><span>{{ copy(`l.stat.${key}`) }}</span>
          </dt>
          <dd>{{ value }}</dd>
        </div>
      </dl>
      <template
        v-if="library.state.value.batches.length || library.state.value.query"
        ><div class="library-toolbar">
          <form class="library-search" role="search" @submit.prevent="search">
            <label class="library-search-field"
              ><span class="sr-only">{{ copy("l.search") }}</span
              ><AppIcon name="search" /><input
                ref="searchInput"
                v-model="query"
                type="search"
                :placeholder="copy('l.search.placeholder')" /></label
            ><button class="btn" type="submit">
              {{ copy("l.searchAction") }}</button
            ><button
              v-if="query"
              class="btn quiet"
              type="button"
              @click="
                query = '';
                search();
              "
            >
              {{ copy("l.clear") }}
            </button>
          </form>
          <div class="library-list-meta">
            <h2 id="library-list-title">
              {{
                copy("l.count", { count: library.state.value.batches.length })
              }}
            </h2>
            <p>{{ copy("l.order") }}</p>
          </div>
        </div>
        <section
          ref="listElement"
          class="library-list"
          aria-labelledby="library-list-title"
        >
          <article
            v-for="batch in library.state.value.batches"
            :key="batch.id"
            :data-batch="batch.id"
            class="library-row"
            :class="{ 'library-row-paused': !batch.participatesInRangeReview }"
            :aria-labelledby="`library-title-${batch.id}`"
          >
            <span class="library-book" aria-hidden="true"
              ><AppIcon name="book-open-text"
            /></span>
            <div class="library-row-content">
              <div class="library-meta">
                <span
                  ><AppIcon name="calendar-days" /><time
                    :datetime="batch.savedAt"
                    >{{ format.date(batch.savedAt) }}</time
                  ></span
                ><span>{{ batch.modelName }}</span
                ><span
                  >{{ format.scenario(batch.scenario) }} ·
                  {{ format.length(batch.length) }}</span
                >
              </div>
              <h2 :id="`library-title-${batch.id}`">
                <NuxtLink
                  :to="{
                    path: `/library/${encodeURIComponent(batch.id)}`,
                    query: query ? { entry: query } : {},
                  }"
                  >{{ batch.title }}</NuxtLink
                >
              </h2>
              <p
                v-if="batch.title !== batch.entries.join(' · ')"
                class="batch-targets"
              >
                <span>{{ copy("l.title.targets") }}</span>
                {{ batch.entries.join(" · ") }}
              </p>
              <div class="chips">
                <span v-for="tag in batch.tags" :key="tag" class="chip">{{
                  tag
                }}</span>
              </div>
            </div>
            <div class="library-row-actions">
              <div class="library-main-actions">
                <button class="btn primary" @click="start(batch.id)">
                  {{
                    copy(
                      batch.singleBatchReview?.action === "resume"
                        ? "l.continue"
                        : "l.single",
                    )
                  }}</button
                ><NuxtLink
                  class="btn"
                  :to="{
                    path: `/library/${encodeURIComponent(batch.id)}`,
                    query: query ? { entry: query } : {},
                  }"
                  >{{ copy("l.detail") }}</NuxtLink
                >
              </div>
              <div class="library-manage-actions">
                <BatchParticipation
                  :batch-id="batch.id"
                  :value="batch.participatesInRangeReview"
                /><button
                  class="btn quiet library-delete"
                  @click="deleteId = batch.id"
                >
                  <AppIcon name="trash" />{{ copy("l.delete") }}
                </button>
              </div>
            </div>
          </article>
        </section>
        <div
          v-if="
            !library.state.value.batches.length &&
            library.state.value.status === 'empty'
          "
          class="empty"
        >
          <h2>{{ copy("l.noresults") }}</h2>
          <p>{{ copy("l.noresults.desc") }}</p>
        </div>
        <div v-if="library.state.value.hasMore" class="library-more">
          <button
            ref="moreButton"
            class="btn"
            :disabled="library.state.value.loadingMore"
            @click="loadMore"
          >
            {{ copy("l.more") }}
          </button>
        </div></template
      >
      <div v-else-if="library.state.value.status === 'empty'" class="empty">
        <h2>{{ copy("l.empty") }}</h2>
        <p>{{ copy("l.empty.desc") }}</p>
        <NuxtLink class="btn primary" to="/create">{{
          copy("create")
        }}</NuxtLink>
      </div>
      <p v-if="library.state.value.status === 'loading'" role="status">
        {{ copy("loading") }}
      </p>
      <button
        v-if="library.state.value.status === 'failed'"
        class="btn"
        @click="library.load(query)"
      >
        {{ copy("retry") }}
      </button>
    </div>
    <AppDialog
      id="delete-batch"
      :open="deleteId !== null"
      :title="copy('l.delete.title')"
      @close="deleteId = null"
      ><p>{{ copy("l.delete.desc") }}</p>
      <template #footer
        ><button class="btn" :disabled="busy" @click="deleteId = null">
          {{ copy("cancel") }}</button
        ><button class="btn danger" :disabled="busy" @click="remove">
          {{ copy("l.delete") }}
        </button></template
      ></AppDialog
    ></LearnerPageBoundary
  >
</template>
