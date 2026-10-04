<script setup lang="ts">
import { useAnalyticsStore } from "@runtime/stores/analytics";
import { presentMetric } from "@presentation/analytics/metric";
definePageMeta({ middleware: "admin", layout: "admin" });
const analytics = useAnalyticsStore(),
  { copy } = useDesignCopy(),
  format = useDisplayFormatters();
await usePageLoader("admin-overview", () => analytics.load());
const overview = computed(() => analytics.state.value.overview),
  display = (m: Parameters<typeof presentMetric>[0], ratio = false) =>
    presentMetric(m, copy, ratio);
const modules = [
  { path: "analytics", key: "metrics" },
  { path: "models", key: "models" },
  { path: "plans", key: "plans" },
  { path: "users", key: "users" },
  { path: "growth", key: "operations" },
  { path: "notices", key: "messages" },
  { path: "presets", key: "presets" },
];
</script>
<template>
  <div>
    <div class="section-head">
      <div>
        <h1>{{ copy("a.adminhome") }}</h1>
        <p class="muted">{{ copy("a.overview.desc") }}</p>
      </div>
      <NuxtLink class="btn" to="/admin/analytics">{{
        copy("a.analysis.open")
      }}</NuxtLink>
    </div>
    <AppError
      v-for="(failure, key) in analytics.state.value.failures"
      :key="key"
      :failure="failure ?? null"
    /><button
      v-if="Object.keys(analytics.state.value.failures).length"
      class="btn"
      :disabled="analytics.state.value.pending"
      @click="analytics.load()"
    >
      {{ copy("retry") }}
    </button>
    <p v-if="overview?.freshness === 'delayed'" class="notice warn">
      {{ copy("delayed") }}
    </p>
    <div class="metrics-grid">
      <div
        v-for="tile in [
          { key: 'uv', value: display(overview?.today.uv) },
          { key: 'wau', value: display(overview?.last7Days.wau) },
          {
            key: 'completed',
            value: display(
              analytics.state.value.funnel?.review.completionRate,
              true,
            ),
          },
          {
            key: 'failure',
            value: display(overview?.last7Days.generationFailureRate, true),
          },
        ]"
        :key="tile.key"
        class="metric"
      >
        <small>{{ copy(tile.key) }}</small
        ><strong>{{ tile.value }}</strong>
      </div>
    </div>
    <p class="muted">
      {{
        copy("updated", {
          time: overview?.updatedAt ? format.dateTime(overview.updatedAt) : "—",
        })
      }}
      · {{ copy("metrics.time") }}
    </p>
    <div class="admin-launch-grid">
      <NuxtLink
        v-for="module in modules"
        :key="module.path"
        :to="'/admin/' + module.path"
        class="panel admin-launch"
        ><h2>{{ copy("a." + module.key) }}<AppIcon name="arrow-up-right" /></h2>
        <p>{{ copy("a." + module.key + ".desc") }}</p></NuxtLink
      >
    </div>
  </div>
</template>
