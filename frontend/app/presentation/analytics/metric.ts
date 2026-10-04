import type { MetricModel } from "@application/analytics/models";
export function presentMetric(
  metric: MetricModel | null | undefined,
  copy: (key: string) => string,
  ratio = false,
): string {
  if (!metric) return copy("unknown");
  if (metric.status !== "ready" || metric.value === null)
    return metric.status === "no_sample"
      ? copy("nosample")
      : metric.status === "observing"
        ? copy("observing")
        : copy("unknown");
  return ratio ? (metric.value * 100).toFixed(1) + "%" : String(metric.value);
}
export function metricPaths(
  values: readonly (number | null)[],
  width = 560,
  height = 130,
  max = 1,
): string[] {
  const paths: string[] = [];
  let current = "";
  for (let i = 0; i < values.length; i++) {
    const value = values[i];
    if (value === null || value === undefined) {
      if (current) paths.push(current);
      current = "";
      continue;
    }
    const x =
        40 +
        (values.length === 1 ? width / 2 : (i * width) / (values.length - 1)),
      y = 15 + height * (1 - Math.min(max, value) / max);
    current += (current ? " L" : "M") + x.toFixed(2) + " " + y.toFixed(2);
  }
  if (current) paths.push(current);
  return paths;
}
