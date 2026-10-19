import type {
  ConfigPortabilityCategory,
  PortabilityChange,
  PortabilityNotice,
} from "@application/admin/config-portability";

type Copy = (key: string, values?: Record<string, string | number>) => string;
type PresentedChange = Omit<Readonly<PortabilityChange>, "fields"> & {
  readonly fields: readonly Readonly<PortabilityChange["fields"][number]>[];
};
type PresentedNotice = Omit<Readonly<PortabilityNotice>, "itemRef"> & {
  readonly itemRef: Readonly<NonNullable<PortabilityNotice["itemRef"]>> | null;
};
export const portabilityCategoryCopyKey: Record<
  ConfigPortabilityCategory,
  string
> = {
  models: "nav.models",
  plans: "nav.plans",
  items: "growth.itemTab",
  growth: "growth.title",
};

const knownNotice: Record<string, string> = {
  name_generated: "notice.nameGenerated",
  optional_value_cleared: "notice.optionalValueCleared",
  reward_quantity_zero: "notice.rewardQuantityZero",
  checkin_current_selected: "notice.checkinCurrentSelected",
  language_fallback: "notice.languageFallback",
  plan_no_models: "notice.planNoModels",
  plan_no_lengths: "notice.planNoLengths",
  category_cleared: "notice.categoryCleared",
  effective_plan_may_change: "notice.effectivePlanMayChange",
  level_may_downgrade: "notice.levelMayDowngrade",
};

export function formatPortabilityValue(
  value: unknown,
  field: string,
  copy: Copy,
): string {
  if (value === null)
    return field === "/rolling_24h_limit"
      ? copy("change.valueUnlimited")
      : copy("change.valueNotSet");
  if (Array.isArray(value))
    return value.length
      ? value
          .map((item) => formatPortabilityValue(item, field, copy))
          .join(", ")
      : copy("change.valueNone");
  if (value === "") return copy("change.valueEmpty");
  if (typeof value === "boolean") return String(value);
  if (typeof value === "number" || typeof value === "string")
    return String(value);
  if (value && typeof value === "object")
    return Object.entries(value as Record<string, unknown>)
      .map(
        ([key, item]) =>
          `${key}: ${formatPortabilityValue(item, `${field}/${key}`, copy)}`,
      )
      .join("; ");
  return copy("change.valueMissing");
}

export function presentFieldChange(
  change: PresentedChange,
  field: Readonly<PortabilityChange["fields"][number]>,
  copy: Copy,
) {
  const missing = copy("change.valueMissing"),
    before =
      change.action === "added"
        ? missing
        : formatPortabilityValue(field.before, field.field, copy),
    after =
      change.action === "removed"
        ? missing
        : formatPortabilityValue(field.after, field.field, copy);
  const key =
    change.action === "added"
      ? "change.fieldAdded"
      : change.action === "removed"
        ? "change.fieldRemoved"
        : "change.fieldChanged";
  return copy(key, { field: field.field, before, after });
}

export function presentNotice(
  notice: PresentedNotice,
  changes: readonly PresentedChange[],
  copy: Copy,
): string {
  const message = copy(knownNotice[notice.code] ?? "notice.unknown");
  const change = notice.itemRef
    ? changes.find(
        (item) =>
          item.kind === notice.itemRef!.kind &&
          item.identity === notice.itemRef!.identity,
      )
    : null;
  if (change && notice.field)
    return copy("notice.itemField", {
      item: change.label || change.identity,
      field: notice.field,
      message,
    });
  if (change)
    return copy("notice.item", {
      item: change.label || change.identity,
      message,
    });
  return copy("notice.category", { message });
}

export function formattedServerTime(value: string, language: "zh" | "en") {
  return new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZone: "Asia/Shanghai",
    timeZoneName: "short",
  }).format(new Date(value));
}
