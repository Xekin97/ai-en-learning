<script setup lang="ts">
import { metricPaths } from "@presentation/analytics/metric";
const props = defineProps<{
  label: string;
  labels: readonly string[];
  series: readonly { label: string; values: readonly (number | null)[] }[];
  max?: number;
}>();
const paths = computed(() =>
  props.series.map((s) => ({
    label: s.label,
    paths: metricPaths(s.values, 560, 130, props.max ?? 1),
  })),
);
</script>
<template>
  <svg
    viewBox="0 0 640 180"
    role="img"
    :aria-label="label"
    class="metric-chart"
  >
    <path d="M30 10V145H620" fill="none" stroke="#a7b7a8" />
    <g v-for="(line, index) in paths" :key="line.label">
      <path
        v-for="(path, i) in line.paths"
        :key="i"
        :d="path"
        fill="none"
        :stroke="['#21654e', '#a65c31', '#5f6d65'][index % 3]"
        stroke-width="3"
        :stroke-dasharray="
          index === 1 ? '7 4' : index === 2 ? '2 4' : undefined
        "
      />
    </g>
    <text v-if="labels.length" x="40" y="172" fill="#5f6d65" font-size="12">
      {{ labels[0] }}
    </text>
    <text
      v-if="labels.length > 1"
      x="535"
      y="172"
      fill="#5f6d65"
      font-size="12"
    >
      {{ labels.at(-1) }}
    </text>
  </svg>
</template>
