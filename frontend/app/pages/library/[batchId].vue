<script setup lang="ts">
import { useLearnerAccess } from "@presentation/controllers/learner-access";
const access = useLearnerAccess();
definePageMeta({ middleware: "learner" });
const route = useRoute();
const library = useLibraryStore();
const format = useDisplayFormatters();
const batchId = String(route.params.batchId);
const deleteOpen = ref(false);
await access.initialize(async () => {
  await usePageLoader(`batch:${batchId}`, () => library.loadDetail(batchId));
});
const batch = computed(() => library.state.value.details[batchId] ?? null);
useLocalizedHead("library.detail");

async function remove() {
  await library.remove(batchId);
  await navigateTo("/library");
}
</script>

<template>
  <div class="container page-section">
    <LearnerPageBoundary :view="access.view.value" @retry="access.retry">
      <AppError :failure="library.state.value.failure" />
      <template v-if="batch">
        <header class="page-heading">
          <div>
            <p class="eyebrow">{{ $t("library.detailEyebrow") }}</p>
            <h1 class="page-title">
              {{ batch.targets.map((target) => target.entry).join(" · ") }}
            </h1>
          </div>
          <NuxtLink class="button button-secondary" to="/library">{{
            $t("review.backToLibrary")
          }}</NuxtLink>
        </header>
        <section class="detail-grid">
          <article class="card">
            <header class="card-header">
              <div>
                <h2 class="card-title">{{ $t("library.story") }}</h2>
                <p class="card-subtitle">
                  {{
                    $t("library.savedAt", { date: format.date(batch.savedAt) })
                  }}
                </p>
              </div>
              <span
                class="status-badge"
                :class="
                  batch.participatesInRangeReview
                    ? 'status-success'
                    : 'status-muted'
                "
                >{{
                  batch.participatesInRangeReview
                    ? $t("library.included")
                    : $t("library.paused")
                }}</span
              >
            </header>
            <div class="card-body">
              <div class="passage-tags">
                <span class="passage-tags-label">{{ $t("create.tags") }}</span>
                <div class="chip-list">
                  <span
                    v-for="tag in batch.tags"
                    :key="tag"
                    class="tag tag-passage"
                    >{{ tag }}</span
                  >
                </div>
              </div>
              <p class="reading-passage">
                <template
                  v-for="(segment, index) in batch.passageSegments"
                  :key="index"
                  ><mark v-if="segment.kind === 'target'" class="target-word">{{
                    segment.text
                  }}</mark
                  ><template v-else>{{ segment.text }}</template></template
                >
              </p>
              <section class="resource-section">
                <h2 class="card-title">{{ $t("create.targets") }}</h2>
                <div class="resource-grid detail-resources">
                  <article
                    v-for="target in batch.targets"
                    :key="target.entry"
                    class="resource-card"
                  >
                    <h3 class="resource-word">{{ target.entry }}</h3>
                    <p>{{ target.entryMeaning }}</p>
                    <p class="resource-phrase">
                      “<template
                        v-for="(segment, index) in target.hintSegments"
                        :key="index"
                        >{{ segment.text }}</template
                      >”
                    </p>
                  </article>
                </div>
              </section>
            </div>
          </article>
          <aside class="detail-aside">
            <section class="card">
              <div class="card-body">
                <h2 class="card-title">{{ $t("library.preferences") }}</h2>
                <hr class="divider" />
                <dl class="definition-list">
                  <div>
                    <dt>{{ $t("create.model") }}</dt>
                    <dd>{{ batch.configuration.modelName }}</dd>
                  </div>
                  <div>
                    <dt>{{ $t("create.meaningLanguage") }}</dt>
                    <dd>
                      {{ format.meaning(batch.configuration.meaningLanguage) }}
                    </dd>
                  </div>
                  <div>
                    <dt>{{ $t("create.scenario") }}</dt>
                    <dd>{{ format.scenario(batch.configuration.scenario) }}</dd>
                  </div>
                  <div>
                    <dt>{{ $t("create.length") }}</dt>
                    <dd>{{ format.length(batch.configuration.length) }}</dd>
                  </div>
                  <div>
                    <dt>{{ $t("library.reviewCompleted") }}</dt>
                    <dd>
                      {{
                        $t("library.times", {
                          count: batch.reviewSummary.completedCount,
                        })
                      }}
                    </dd>
                  </div>
                </dl>
              </div>
            </section>
            <section class="card">
              <div class="card-body">
                <div class="inline-actions">
                  <label class="batch-review-check batch-review-check-panel"
                    ><input
                      type="checkbox"
                      :checked="batch.participatesInRangeReview"
                      @change="
                        library.setParticipation(
                          batchId,
                          ($event.target as HTMLInputElement).checked,
                        )
                      "
                    /><span>{{ $t("library.included") }}</span></label
                  ><button
                    class="button button-danger-quiet"
                    type="button"
                    @click="deleteOpen = true"
                  >
                    {{ $t("common.delete") }}
                  </button>
                </div>
              </div>
            </section>
          </aside>
        </section>
        <AppDialog
          id="delete-batch-detail"
          :open="deleteOpen"
          :title="$t('library.deleteTitle')"
          @close="deleteOpen = false"
          ><div class="notice notice-danger">
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
              @click="deleteOpen = false"
            >
              {{ $t("common.keep") }}</button
            ><button class="button button-danger" type="button" @click="remove">
              {{ $t("common.delete") }}
            </button></template
          ></AppDialog
        >
      </template>
      <section
        v-else-if="library.state.value.status !== 'loading'"
        class="empty-state card"
      >
        <span class="empty-symbol" aria-hidden="true">?</span>
        <h1>{{ $t("library.notFound") }}</h1>
        <p>{{ $t("library.notFoundCopy") }}</p>
        <NuxtLink class="button button-secondary" to="/library">{{
          $t("common.back")
        }}</NuxtLink>
      </section>
    </LearnerPageBoundary>
  </div>
</template>
