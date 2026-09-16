import type {
  GroupCode,
  MeaningLanguage,
  PassageLength,
  Scenario,
} from "@application/shared/models";

export function useDisplayFormatters() {
  const { t, locale } = useI18n();
  return {
    meaning: (value: MeaningLanguage) => t(`enum.meaning.${value}`),
    meaningDescription: (value: MeaningLanguage) =>
      t(`enum.meaningDescription.${value}`),
    scenario: (value: Scenario) => t(`enum.scenario.${value}`),
    scenarioDescription: (value: Scenario) =>
      t(`enum.scenarioDescription.${value}`),
    length: (value: PassageLength) => t(`enum.length.${value}`),
    group: (value: GroupCode) => t(`enum.group.${value}`),
    adminDate: (value: string) => value.slice(0, 10),
    integer: (value: number) =>
      new Intl.NumberFormat(locale.value, {
        notation: "standard",
        maximumFractionDigits: 0,
      }).format(value),
    date: (value: string) =>
      new Intl.DateTimeFormat(locale.value, { dateStyle: "medium" }).format(
        new Date(value),
      ),
  };
}
