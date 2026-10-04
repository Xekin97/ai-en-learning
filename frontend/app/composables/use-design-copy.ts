/** Exact UI22 copy compiled by scripts/sync-design.mjs. */
export function useDesignCopy() {
  const { t, locale } = useI18n();
  const copy = (key: string, values: Record<string, string | number> = {}) =>
    t(`m002.${key.replaceAll(".", "__")}`, values);
  return {
    copy,
    language: computed(() => (locale.value === "zh-CN" ? "zh" : "en")),
  };
}
