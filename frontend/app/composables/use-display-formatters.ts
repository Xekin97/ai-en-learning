import type {
  GroupCode,
  MeaningLanguage,
  PassageLength,
  Scenario,
} from "@application/shared/models";

export function useDisplayFormatters() {
  const { t, locale } = useI18n();
  const { copy } = useDesignCopy();
  return {
    meaning: (value: MeaningLanguage) =>
      copy(
        `a.preset.language.${{ zh: "中文", en: "English", ja: "日本語" }[value]}`,
      ),
    meaningDescription: (value: MeaningLanguage) =>
      t(`enum.meaningDescription.${value}`),
    scenario: (value: Scenario) =>
      copy(
        `a.preset.style.${{ story: "Story", discussion: "Discussion", business: "Business", news: "News" }[value]}`,
      ),
    scenarioDescription: (value: Scenario) =>
      t(`enum.scenarioDescription.${value}`),
    length: (value: PassageLength) =>
      copy(
        `a.preset.length.${{ short: "Brief", medium: "Standard", long: "Extended", xlong: "Deep Dive" }[value]}`,
      ),
    group: (value: GroupCode) => t(`enum.group.${value}`),
    adminDate: (value: string) => value.slice(0, 10),
    calendarDate: (value: string) => {
      const parts = new Intl.DateTimeFormat("en", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone: "Asia/Shanghai",
      }).formatToParts(new Date(value));
      return ["year", "month", "day"]
        .map((type) => parts.find((part) => part.type === type)?.value ?? "")
        .join("-");
    },
    integer: (value: number) =>
      new Intl.NumberFormat(locale.value, {
        notation: "standard",
        maximumFractionDigits: 0,
      }).format(value),
    dateTime: (value: string) => {
      const chinese = locale.value === "zh-CN";
      const parts = new Intl.DateTimeFormat(locale.value, {
        year: "numeric",
        month: chinese ? "numeric" : "short",
        day: "numeric",
        hour: chinese ? "2-digit" : "numeric",
        minute: "2-digit",
        hourCycle: chinese ? "h23" : "h12",
        timeZone: "Asia/Shanghai",
      }).formatToParts(new Date(value));
      const part = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((item) => item.type === type)?.value ?? "";
      // Host ICU versions differ in date/time connectors (", " versus " at ").
      // Keep the existing display format identical during SSR and hydration.
      const time = `${part("hour")}:${part("minute")}`;
      return chinese
        ? `${part("year")}年${part("month")}月${part("day")}日 ${time}`
        : `${part("month")} ${part("day")}, ${part("year")}, ${time} ${part("dayPeriod")}`;
    },
    date: (value: string) =>
      new Intl.DateTimeFormat(locale.value, { dateStyle: "medium" }).format(
        new Date(value),
      ),
  };
}
