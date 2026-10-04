<script setup lang="ts">
import { useAnalyticsStore } from "@runtime/stores/analytics";
import { presentMetric } from "@presentation/analytics/metric";
definePageMeta({ middleware: "admin", layout: "admin" });
const analytics = useAnalyticsStore(),
  { copy } = useDesignCopy(),
  format = useDisplayFormatters();
const info = ref(false),
  clarityInfo = ref(false);
await usePageLoader("admin-analytics", () => analytics.load());
const traffic = computed(() => analytics.state.value.traffic),
  funnel = computed(() => analytics.state.value.funnel),
  retention = computed(() => analytics.state.value.retention),
  overview = computed(() => analytics.state.value.overview);
const display = (m: Parameters<typeof presentMetric>[0], ratio = false) =>
    presentMetric(m, copy, ratio),
  latest = computed(() => retention.value?.series.at(-1)),
  cohort = computed(() => retention.value?.cohorts[0]);
const maxPv = computed(() =>
  Math.max(1, ...(traffic.value?.series.map((p) => p.pv.value ?? 0) ?? [])),
);
const retentionLines = computed(() =>
  ["d1", "d7", "d30"].map((key) => ({
    label: key.toUpperCase(),
    values:
      retention.value?.cohorts.map(
        (c) => c[key as "d1" | "d7" | "d30"].value,
      ) ?? [],
  })),
);
const details = computed(() => [
  { key: "bounce", value: display(traffic.value?.bounceRate, true) },
  {
    key: "a.metrics.reviewSuccess",
    value: display(funnel.value?.review.successRate, true),
  },
  {
    key: "a.metrics.sameDayActivation",
    value: display(funnel.value?.activation.sameDay, true),
  },
  {
    key: "a.metrics.requestFailed",
    value: display(funnel.value?.generation.failed),
  },
  {
    key: "a.metrics.requestCancelled",
    value: display(funnel.value?.generation.cancelled),
  },
  {
    key: "a.metrics.requestRunning",
    value: display(funnel.value?.generation.ongoing),
  },
  {
    key: "a.metrics.precheck",
    value: display(funnel.value?.generation.precheckRejected),
  },
  { key: "gens", value: display(funnel.value?.generation.valid) },
]);
function period(event: Event) {
  void analytics.load(
    Number((event.target as HTMLSelectElement).value) === 30 ? 30 : 7,
  );
}
</script>
<template>
  <div>
    <div class="section-head">
      <div>
        <h1>{{ copy("metrics.title") }}</h1>
        <p class="muted">{{ copy("metrics.time") }}</p>
      </div>
      <span class="muted">{{
        copy("updated", {
          time: traffic?.updatedAt ? format.dateTime(traffic.updatedAt) : "—",
        })
      }}</span>
    </div>
    <AppError
      v-for="(failure, key) in analytics.state.value.failures"
      :key="key"
      :failure="failure ?? null"
    /><button
      v-if="Object.keys(analytics.state.value.failures).length"
      class="btn"
      :disabled="analytics.state.value.pending"
      @click="analytics.load(analytics.state.value.period)"
    >
      {{ copy("retry") }}
    </button>
    <p
      v-if="
        [traffic?.freshness, funnel?.freshness, retention?.freshness].includes(
          'delayed',
        )
      "
      class="notice warn"
    >
      {{ copy("delayed") }}
    </p>
    <div class="toolbar">
      <label class="field"
        ><span>{{ copy("period") }}</span
        ><select
          :value="analytics.state.value.period"
          :disabled="analytics.state.value.pending"
          @change="period"
        >
          <option :value="7">{{ copy("days7") }}</option>
          <option :value="30">{{ copy("days30") }}</option>
        </select></label
      ><span v-if="traffic" class="muted"
        >{{ traffic.range.startDay }} — {{ traffic.range.endDay }}</span
      >
    </div>
    <div class="metrics-grid">
      <div
        v-for="tile in [
          { key: 'uv', value: display(traffic?.uv) },
          { key: 'pv', value: display(traffic?.pv) },
          { key: 'wau', value: display(latest?.wau) },
          {
            key: 'failure',
            value: display(funnel?.generation.failureRate, true),
          },
        ]"
        :key="tile.key"
        class="metric"
      >
        <small>{{ copy(tile.key) }}</small
        ><strong>{{ tile.value }}</strong>
      </div>
    </div>
    <div class="split">
      <section class="panel">
        <h2>{{ copy("traffic") }}</h2>
        <div
          class="chart"
          :class="{ 'chart-dense': (traffic?.series.length ?? 0) > 7 }"
          role="img"
          :aria-label="copy('traffic')"
        >
          <div
            v-for="point in traffic?.series ?? []"
            :key="point.day"
            class="bar"
            :style="{
              height:
                (point.pv.value === null ? 0 : (point.pv.value / maxPv) * 100) +
                '%',
            }"
            :title="point.day + ' · ' + display(point.pv)"
          >
            <span>{{ point.day.slice(5) }}</span>
          </div>
        </div>
        <details>
          <summary>{{ copy("traffic") }}</summary>
          <div class="table-wrap" tabindex="0">
            <table class="data-table">
              <thead>
                <tr>
                  <th>{{ copy("a.time") }}</th>
                  <th>PV</th>
                  <th>UV</th>
                  <th>{{ copy("bounce") }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="point in traffic?.series ?? []" :key="point.day">
                  <td>{{ point.day }}</td>
                  <td>{{ display(point.pv) }}</td>
                  <td>{{ display(point.uv) }}</td>
                  <td>{{ display(point.bounceRate, true) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </details>
        <div class="answer-row">
          <span>{{ copy("channel") }}</span
          ><span>UTM / Direct / Referrer</span>
        </div>
        <div
          v-for="channel in traffic?.channels ?? []"
          :key="channel.sourceType"
          class="answer-row"
        >
          <span>{{
            channel.sourceType === "utm"
              ? "UTM"
              : channel.sourceType === "referrer"
                ? "Referrer"
                : "Direct"
          }}</span
          ><span
            >PV {{ display(channel.pv) }} · UV {{ display(channel.uv) }}</span
          >
        </div>
      </section>
      <section class="panel">
        <h2>{{ copy("funnel") }}</h2>
        <template
          v-for="row in [
            { key: 'registered', metric: funnel?.registration.rate },
            { key: 'activated', metric: funnel?.activation.within7Days },
            { key: 'completed', metric: funnel?.review.completionRate },
          ]"
          :key="row.key"
          ><div class="answer-row">
            <span>{{ copy(row.key) }}</span
            ><strong>{{ display(row.metric, true) }}</strong>
          </div>
          <div
            v-if="row.metric?.value !== null && row.metric?.value !== undefined"
            class="progress"
          >
            <span :style="{ width: row.metric.value * 100 + '%' }" /></div
        ></template>
      </section>
    </div>
    <section class="panel section">
      <h2>{{ copy("retention") }}</h2>
      <p v-if="cohort" class="muted">
        {{ copy("a.created") }} · {{ cohort.registrationDay }}
      </p>
      <div class="stats">
        <div v-for="day in ['d1', 'd7', 'd30'] as const" :key="day">
          <small>{{ day.toUpperCase() }}</small
          ><strong>{{ display(cohort?.[day], true) }}</strong>
        </div>
      </div>
      <div class="actions section">
        <button class="btn" @click="info = true">
          {{ copy("metrics.definition") }}</button
        ><a
          v-if="traffic?.clarity.available && traffic.clarity.url"
          class="btn"
          :href="traffic.clarity.url"
          target="_blank"
          rel="noopener noreferrer"
          >{{ copy("clarity") }}</a
        ><button v-else class="btn" @click="clarityInfo = true">
          {{ copy("clarity") }}
        </button>
      </div>
      <p class="muted">{{ copy("clarity.note") }}</p>
    </section>
    <section class="panel section">
      <h2>{{ copy("retention") }}</h2>
      <MetricChart
        :label="copy('retention')"
        :labels="retention?.cohorts.map((c) => c.registrationDay) ?? []"
        :series="retentionLines"
      />
      <p class="muted">D1 — D7 ┄ D30 ·</p>
      <div class="table-wrap" tabindex="0">
        <table class="data-table">
          <thead>
            <tr>
              <th>{{ copy("a.created") }}</th>
              <th>D1</th>
              <th>D7</th>
              <th>D30</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in retention?.cohorts ?? []"
              :key="row.registrationDay"
            >
              <td>{{ row.registrationDay }}</td>
              <td>{{ display(row.d1, true) }}</td>
              <td>{{ display(row.d7, true) }}</td>
              <td>{{ display(row.d30, true) }}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="table-wrap" tabindex="0">
        <table class="data-table">
          <tbody>
            <tr v-for="row in details" :key="row.key">
              <th>{{ copy(row.key) }}</th>
              <td>{{ row.value }}</td>
            </tr>
            <tr>
              <th>
                {{ copy("adminusage")
                }}<small v-if="overview"
                  >{{ overview.range.startDay }} —
                  {{ overview.range.endDay }}</small
                >
              </th>
              <td>
                {{ overview?.previewUsage.logicalRuns ?? copy("unknown") }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <details>
        <summary>{{ copy("reviewfreq") }}</summary>
        <div class="table-wrap" tabindex="0">
          <table class="data-table">
            <thead>
              <tr>
                <th>{{ copy("a.time") }}</th>
                <th>{{ copy("wau") }}</th>
                <th>{{ copy("gens") }}</th>
                <th>{{ copy("savecount") }}</th>
                <th>{{ copy("reviewfreq") }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in retention?.series ?? []" :key="row.day">
                <td>{{ row.day }}</td>
                <td>{{ display(row.wau) }}</td>
                <td>{{ display(row.validGenerations) }}</td>
                <td>{{ display(row.savedPassages) }}</td>
                <td>{{ display(row.reviewsPerActiveLearner) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </details>
      <p class="muted">{{ copy("metrics.separate") }}</p>
    </section>
    <AppDialog
      id="metric-definition"
      :open="info"
      :title="copy('metrics.definition')"
      @close="info = false"
      ><p class="notice">{{ copy("metrics.rules") }}</p></AppDialog
    ><AppDialog
      id="clarity-info"
      :open="clarityInfo"
      :title="copy('clarity')"
      @close="clarityInfo = false"
      ><p class="notice">{{ copy("clarity.unavailable") }}</p></AppDialog
    >
  </div>
</template>
<style scoped>
/* Daily data must not become the grid's minimum width. */
.split {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.split > .panel {
  min-width: 0;
}
.bar {
  min-width: 0;
}
.bar span {
  width: max-content;
  left: 50%;
  transform: translateX(-50%);
}
.bar:first-child span {
  left: 0;
  transform: none;
}
.bar:last-child span {
  left: auto;
  right: 0;
  transform: none;
}
.chart-dense {
  gap: 4px;
}
/* Keep every daily bar and the full data table; space only the axis labels. */
.chart-dense .bar:not(:first-child):not(:nth-child(8n)):not(:last-child) span {
  display: none;
}
.metrics-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.metric {
  min-width: 0;
}
@media (max-width: 760px) {
  .metrics-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .split {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (max-width: 480px) {
  .metric strong {
    font-size: clamp(20px, 6vw, 28px);
  }
  .chart:not(.chart-dense) .bar:nth-child(even) span {
    display: none;
  }
}
</style>
