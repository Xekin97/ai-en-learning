export function useLocalizedHead(key: string): void {
  const { t } = useI18n();
  useHead({ title: () => String(t(key)) });
}
