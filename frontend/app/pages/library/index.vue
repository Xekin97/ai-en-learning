<script setup lang="ts">
import { useLearnerAccess } from "@presentation/controllers/learner-access";
import { presentLibraryPage } from "@presentation/library/library-page-presenter";
const access = useLearnerAccess();

const library = useLibraryStore();
const format = useDisplayFormatters();
const query = ref(library.state.value.query);
const deleteBatchId = ref<string | null>(null);
const view = computed(() =>
  presentLibraryPage({
    status: library.state.value.status,
    query: library.state.value.query,
    batchCount: library.state.value.batches.length,
  }),
);

await access.initialize(async () => {
  await usePageLoader("library", () => library.load());
});
useLocalizedHead("common.library");

async function startReview(batchId: string) {
  const sessionId = await library.beginSingleBatch(batchId);
  await navigateTo({
    path: `/review/${encodeURIComponent(sessionId)}`,
    query: { batch: batchId },
  });
}

async function remove(batchId: string) {
  await library.remove(batchId);
  deleteBatchId.value = null;
}
</script>

<template>
  <div class="container page-section">
    <LearnerPageBoundary :view="access.view.value" @retry="access.retry">
      <header class="page-heading">
        <div>
          <p class="eyebrow">{{ $t("library.eyebrow") }}</p>
          <h1 class="page-title">{{ $t("library.title") }}</h1>
          <p class="page-description">
            {{
              view.isFirstEmpty
                ? $t("library.contentCopy")
                : $t("library.description")
            }}
          </p>
        </div>
        <NuxtLink
          v-if="view.showCollection"
          class="button button-primary"
          to="/review"
          >{{ $t("library.dateReview") }}</NuxtLink
        >
      </header>
      <AppError :failure="library.state.value.failure" />

      <template v-if="view.showCollection">
        <div v-if="library.state.value.summary" class="stats-grid">
          <div class="stat-card">
            <div class="stat-value">
              {{ library.state.value.summary.generationCount }}
            </div>
            <div class="stat-label">{{ $t("library.created") }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">
              {{ library.state.value.summary.uniqueLearnedEntries }}
            </div>
            <div class="stat-label">{{ $t("library.words") }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">
              {{ library.state.value.summary.participatingBatches }}
            </div>
            <div class="stat-label">{{ $t("library.reviewing") }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">
              {{ library.state.value.summary.pausedBatches }}
            </div>
            <div class="stat-label">{{ $t("library.paused") }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">
              {{ library.state.value.summary.successfulReviewCount }}
            </div>
            <div class="stat-label">{{ $t("library.completed") }}</div>
          </div>
          <div class="stat-card">
            <div class="stat-value">
              {{ library.state.value.summary.batchesEverReviewedSuccessfully }}
            </div>
            <div class="stat-label">{{ $t("library.mastered") }}</div>
          </div>
        </div>

        <form
          class="toolbar"
          role="search"
          @submit.prevent="library.load(query)"
        >
          <div class="toolbar-search input-with-icon">
            <AppIcon name="search" /><input
              v-model="query"
              class="text-input"
              :placeholder="$t('library.searchPlaceholder')"
              :aria-label="$t('library.searchLabel')"
              @keyup.enter.prevent="library.load(query)"
            />
          </div>
          <span class="helper">{{
            $t("library.batchCount", {
              count: library.state.value.batches.length,
            })
          }}</span>
        </form>

        <div v-if="view.showLoading" class="skeleton" />
        <section v-else-if="view.showBatches" class="batch-list">
          <article
            v-for="batch in library.state.value.batches"
            :key="batch.id"
            class="batch-row"
          >
            <div>
              <div class="batch-title">
                <h3>{{ batch.entries.join(" · ") }}</h3>
              </div>
              <div class="chip-list">
                <span v-for="tag in batch.tags" :key="tag" class="tag">{{
                  tag
                }}</span>
              </div>
              <div class="batch-meta">
                <span>{{
                  $t("library.joinedAt", { date: format.date(batch.savedAt) })
                }}</span
                ><span
                  >{{ format.scenario(batch.scenario) }} ·
                  {{ format.length(batch.length) }}</span
                ><span>{{ batch.modelName }}</span>
              </div>
            </div>
            <div class="menu">
              <button
                class="button button-primary button-small"
                type="button"
                @click="startReview(batch.id)"
              >
                {{
                  batch.singleBatchReview?.action === "resume"
                    ? $t("library.continueStory")
                    : $t("library.reviewStory")
                }}
              </button>
              <NuxtLink
                class="button button-quiet button-small"
                :to="`/library/${batch.id}`"
                >{{ $t("common.open") }}</NuxtLink
              >
              <label class="batch-review-check"
                ><input
                  type="checkbox"
                  :checked="batch.participatesInRangeReview"
                  @change="
                    library.setParticipation(
                      batch.id,
                      ($event.target as HTMLInputElement).checked,
                    )
                  "
                /><span>{{ $t("library.included") }}</span></label
              >
              <button
                class="button button-danger-quiet button-small button-icon"
                type="button"
                :aria-label="$t('library.deleteTitle')"
                @click="deleteBatchId = batch.id"
              >
                <AppIcon name="trash" />
              </button>
            </div>
          </article>
        </section>
        <section v-else-if="view.isSearchEmpty" class="empty-state card">
          <span class="empty-symbol" aria-hidden="true">0</span>
          <h2>{{ $t("library.noMatch") }}</h2>
          <p>{{ $t("library.noMatchCopy") }}</p>
        </section>
        <div v-if="library.state.value.hasMore" class="pagination-actions">
          <button
            class="button button-secondary"
            type="button"
            @click="library.loadMore"
          >
            {{ $t("common.continue") }}
          </button>
        </div>
      </template>
      <section v-else-if="view.isFirstEmpty" class="empty-state card">
        <div class="empty-symbol" aria-hidden="true">
          <AppIcon name="book" />
        </div>
        <h2>{{ $t("library.empty") }}</h2>
        <p>{{ $t("library.emptyCopy") }}</p>
        <NuxtLink class="button button-primary" to="/create">{{
          $t("common.create")
        }}</NuxtLink>
      </section>
      <AppDialog
        id="delete-batch"
        :open="deleteBatchId !== null"
        :title="$t('library.deleteTitle')"
        @close="deleteBatchId = null"
      >
        <div class="notice notice-danger">
          <AppIcon name="alert" />
          <div>
            <strong class="notice-title">{{
              $t("library.deleteWarning")
            }}</strong
            >{{ $t("library.deleteRelated") }}
          </div>
        </div>
        <template #footer
          ><button
            class="button button-secondary"
            type="button"
            @click="deleteBatchId = null"
          >
            {{ $t("common.keep") }}</button
          ><button
            class="button button-danger"
            type="button"
            @click="deleteBatchId && remove(deleteBatchId)"
          >
            {{ $t("common.delete") }}
          </button></template
        >
      </AppDialog>
    </LearnerPageBoundary>
  </div>
</template>
