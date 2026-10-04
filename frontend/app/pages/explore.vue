<script setup lang="ts">
import { attachGalleryMotion } from "@presentation/home/gallery-motion";
import type { MeaningLanguage } from "@application/shared/models";
const presets = usePresetsStore(),
  { copy, language } = useDesignCopy(),
  format = useDisplayFormatters();
const tabs = ["all", "zh", "en", "ja"] as const;
type Filter = (typeof tabs)[number];
const filter = useState<Filter>("gallery-language-filter", () => "all"),
  selectedId = useState<string | null>("gallery-selected-preset", () => null),
  paused = ref(false),
  gallery = ref<HTMLElement>();
const items = computed(() =>
  presets.state.value.items.filter(
    (item) =>
      filter.value === "all" ||
      item.configuration.meaningLanguage === filter.value,
  ),
);
const selected = computed(() =>
  Math.max(
    0,
    items.value.findIndex((item) => item.id === selectedId.value),
  ),
);
const count = (value: Filter) =>
  presets.state.value.items.filter(
    (item) => value === "all" || item.configuration.meaningLanguage === value,
  ).length;
let dispose = () => {};
let bindingVersion = 0;
await usePageLoader("public-presets", () => presets.load());
onMounted(async () => {
  await presets.load(true);
  await bindMotion();
});
async function bindMotion() {
  const version = ++bindingVersion;
  dispose();
  await nextTick();
  if (version !== bindingVersion) return;
  if (gallery.value && presets.state.value.complete)
    dispose = attachGalleryMotion(gallery.value, {
      initialId: selectedId.value,
      paused: paused.value,
      change: (id, manual) => {
        selectedId.value = id;
        paused.value = manual;
      },
      announce: (current, total, title) =>
        copy("gallery.announcement", { current, total, title }),
    });
}
watch([items, language], () => void bindMotion());
onBeforeUnmount(() => {
  bindingVersion++;
  dispose();
});
async function choose(value: Filter) {
  filter.value = value;
  selectedId.value = null;
  paused.value = true;
  await nextTick();
  document
    .getElementById(`gallery-language-${value}`)
    ?.focus({ preventScroll: true });
}
function tabKey(event: KeyboardEvent, index: number) {
  if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const next =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? 3
        : (index + (event.key === "ArrowRight" ? 1 : -1) + 4) % 4;
  void choose(tabs[next]!);
}
async function retry() {
  await presets.load(true, true);
  await bindMotion();
}
</script>
<template>
  <div>
    <div class="page-head">
      <div>
        <h1>{{ copy("explore.title") }}</h1>
        <p>{{ copy("gallery.intro") }}</p>
      </div>
    </div>
    <AppError :failure="presets.state.value.failure" /><button
      v-if="presets.state.value.failure"
      class="btn"
      @click="retry"
    >
      {{ copy("retry") }}
    </button>
    <p v-if="presets.state.value.pending" role="status">
      {{ copy("loading") }}
    </p>
    <div class="gallery-browser">
      <p class="filter-label">{{ copy("explain") }}</p>
      <div
        class="gallery-language-tabs"
        role="tablist"
        :aria-label="copy('gallery.filter.label')"
      >
        <button
          v-for="(value, index) in tabs"
          :id="`gallery-language-${value}`"
          :key="value"
          role="tab"
          :aria-selected="filter === value"
          :tabindex="filter === value ? 0 : -1"
          aria-controls="gallery-results"
          @click="choose(value)"
          @keydown="tabKey($event, index)"
        >
          <span>{{
            value === "all"
              ? copy("gallery.filter.all")
              : format.meaning(value as MeaningLanguage)
          }}</span
          ><span
            v-if="presets.state.value.complete"
            class="gallery-tab-count"
            >{{ count(value) }}</span
          >
        </button>
      </div>
      <div
        id="gallery-results"
        role="tabpanel"
        :aria-labelledby="`gallery-language-${filter}`"
        tabindex="0"
      >
        <section
          v-if="items.length"
          ref="gallery"
          class="preset-gallery"
          :aria-label="copy('gallery.label')"
          :aria-roledescription="copy('gallery.carousel')"
        >
          <div class="gallery-toolbar">
            <div class="gallery-controls">
              <button
                class="btn gallery-arrow"
                data-gallery="previous"
                :disabled="items.length < 2 || !presets.state.value.complete"
                :aria-label="copy('gallery.previous')"
                aria-controls="presets"
              >
                <AppIcon name="arrow-left" /></button
              ><span class="gallery-position" aria-live="off">{{
                copy("gallery.position", {
                  current: selected + 1,
                  total: items.length,
                })
              }}</span
              ><button
                class="btn gallery-arrow"
                data-gallery="next"
                :disabled="items.length < 2 || !presets.state.value.complete"
                :aria-label="copy('gallery.next')"
                aria-controls="presets"
              >
                <AppIcon name="arrow-right" />
              </button>
            </div>
          </div>
          <div
            id="presets"
            class="gallery-track"
            role="group"
            tabindex="0"
            :aria-label="copy('gallery.list')"
          >
            <article
              v-for="(preset, index) in items"
              :key="preset.id"
              class="preset-card gallery-card"
              :data-preset-id="preset.id"
              :aria-labelledby="`preset-name-${index}`"
            >
              <div class="gallery-config">
                <div class="gallery-kicker">
                  <span class="gallery-number" aria-hidden="true">{{
                    String(index + 1).padStart(2, "0")
                  }}</span>
                </div>
                <h2 :id="`preset-name-${index}`">{{ preset.title }}</h2>
                <dl class="gallery-facts">
                  <div>
                    <dt>{{ copy("model") }}</dt>
                    <dd>{{ preset.configuration.model.name }}</dd>
                  </div>
                  <div>
                    <dt>{{ copy("style") }}</dt>
                    <dd>
                      {{ format.scenario(preset.configuration.scenario) }}
                    </dd>
                  </div>
                  <div>
                    <dt>{{ copy("length") }}</dt>
                    <dd>{{ format.length(preset.configuration.length) }}</dd>
                  </div>
                  <div>
                    <dt>{{ copy("explain") }}</dt>
                    <dd>
                      {{ format.meaning(preset.configuration.meaningLanguage) }}
                    </dd>
                  </div>
                </dl>
                <PresetWordMeanings
                  :targets="preset.sample.targets"
                  :meaning-language="preset.configuration.meaningLanguage"
                />
                <div class="gallery-cta">
                  <NuxtLink
                    class="btn primary"
                    :to="`/trial/${encodeURIComponent(preset.id)}`"
                    >{{ copy("try") }}</NuxtLink
                  >
                </div>
              </div>
              <div class="gallery-paper">
                <p class="eyebrow">{{ copy("gallery.fullsample") }}</p>
                <div class="gallery-passage" lang="en">
                  <p
                    v-for="(paragraph, i) in preset.sample.passage.split(
                      /\n\s*\n/,
                    )"
                    :key="i"
                    class="story-text"
                  >
                    {{ paragraph }}
                  </p>
                </div>
                <p class="gallery-sample-note">
                  {{ copy("gallery.sample.note") }}
                </p>
              </div>
            </article>
          </div>
          <p
            class="sr-only gallery-announcement"
            aria-live="polite"
            aria-atomic="true"
          />
        </section>
        <div v-else-if="presets.state.value.complete" class="empty">
          <h2>
            {{
              copy(
                presets.state.value.items.length
                  ? "gallery.filter.empty"
                  : "explore.empty",
              )
            }}
          </h2>
          <p>
            {{
              copy(
                presets.state.value.items.length
                  ? "gallery.filter.emptydesc"
                  : "explore.emptydesc",
              )
            }}
          </p>
          <button
            v-if="filter !== 'all'"
            class="btn primary"
            @click="choose('all')"
          >
            {{ copy("gallery.filter.reset") }}</button
          ><NuxtLink v-else class="btn primary" to="/create">{{
            copy("create")
          }}</NuxtLink>
        </div>
      </div>
    </div>
  </div>
</template>
