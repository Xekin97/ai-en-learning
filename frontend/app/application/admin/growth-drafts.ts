import type {
  AchievementConfigModel,
  AchievementFieldsModel,
  LevelConfigModel,
  LevelInputModel,
  LevelChangesModel,
  AchievementChangesModel,
  GrowthSettingsInput,
} from "./growth";
import type { AchievementKind } from "@application/growth/models";
export type EditorRow<T> = { clientKey: string; id: string | null; value: T };
export const canonicalAmount = (value: string) =>
  /^(0|[1-9]\d*)$/.test(value) && BigInt(value) <= 9223372036854775807n;
export function validReward(reward: LevelInputModel["reward"]) {
  return (
    canonicalAmount(reward.points) &&
    (reward.itemDefinitionId === null
      ? reward.itemCount === 0
      : Number.isInteger(reward.itemCount) &&
        reward.itemCount > 0 &&
        reward.itemCount <= 2147483647)
  );
}
export function validSettings(
  value: Omit<GrowthSettingsInput, "expectedRevision">,
) {
  return (
    Object.values(value).every(canonicalAmount) &&
    BigInt(value.capPoints) >= BigInt(value.basePoints)
  );
}
export function validateLevels(rows: EditorRow<LevelInputModel>[]): boolean {
  return rows.every(
    (row, index) =>
      row.value.levelNumber === index + 1 &&
      canonicalAmount(row.value.minExperience) &&
      validReward(row.value.reward) &&
      (index === 0
        ? row.value.minExperience === "0" &&
          !row.value.rewardEnabled &&
          row.value.reward.points === "0" &&
          row.value.reward.itemDefinitionId === null
        : index > 0 &&
          canonicalAmount(rows[index - 1]!.value.minExperience) &&
          BigInt(row.value.minExperience) >
            BigInt(rows[index - 1]!.value.minExperience)),
  );
}
export function validateAchievements(
  rows: EditorRow<AchievementFieldsModel>[],
): boolean {
  return (
    new Set(rows.map((r) => r.value.threshold)).size === rows.length &&
    rows.every(
      ({ value: r }) =>
        Number.isSafeInteger(r.threshold) &&
        r.threshold > 0 &&
        validReward(r.reward) &&
        canonicalAmount(r.reward.experience) &&
        [r.nameText, r.honorText].every(
          (b) =>
            !!(b.zh?.trim() || b.en?.trim()) &&
            [b.zh, b.en].every(
              (v) => v === null || Array.from(v).length <= 200,
            ),
        ) &&
        [r.descriptionText.zh, r.descriptionText.en].every(
          (v) => v === null || Array.from(v).length <= 2000,
        ),
    )
  );
}
const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
export function levelChanges(
  rows: EditorRow<LevelInputModel>[],
  baseline: LevelConfigModel[],
  revision: string,
): LevelChangesModel {
  return {
    expectedRevision: revision,
    changes: rows
      .filter((r) => {
        const b = baseline.find((b) => b.id === r.id);
        return (
          !b ||
          !equal(r.value, {
            levelNumber: b.levelNumber,
            minExperience: b.minExperience,
            rewardEnabled: b.rewardEnabled,
            reward: b.reward,
          })
        );
      })
      .map((r) => ({
        clientKey: r.clientKey,
        id: r.id,
        value: structuredClone(r.value),
      })),
  };
}
export function achievementChanges(
  kind: AchievementKind,
  rows: EditorRow<AchievementFieldsModel>[],
  baseline: AchievementConfigModel[],
  revision: string,
): AchievementChangesModel {
  return {
    kind,
    expectedRevision: revision,
    changes: rows
      .filter((r) => {
        const b = baseline.find((b) => b.id === r.id);
        return (
          !b ||
          !equal(r.value, {
            threshold: b.threshold,
            enabled: b.enabled,
            nameText: b.nameText,
            honorText: b.honorText,
            descriptionText: b.descriptionText,
            reward: b.reward,
          })
        );
      })
      .map((r) => ({
        clientKey: r.clientKey,
        id: r.id,
        value: structuredClone(r.value),
      })),
  };
}
export function issueKeys(
  fields: Record<string, string>,
  changes: { clientKey: string }[],
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [pointer, code] of Object.entries(fields)) {
    const match = /^\/changes\/(\d+)(\/.*)?$/.exec(pointer),
      key = match ? changes[Number(match[1])]?.clientKey : undefined;
    if (key) (result[key] ??= []).push((match?.[2] ?? "") + ":" + code);
  }
  return result;
}
function cloneData<T>(value: T): T {
  if (Array.isArray(value)) return value.map(cloneData) as T;
  if (value !== null && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, v]) => [key, cloneData(v)]),
    ) as T;
  return value;
}
// Three-way merge preserves explicitly edited fields and adopts remote values only
// where this editor is unchanged. Applying it requires a new explicit save intent.
export function mergeEdited<T>(baseline: T, draft: T, remote: T): T {
  if (equal(baseline, draft)) return cloneData(remote);
  if (
    typeof baseline !== "object" ||
    baseline === null ||
    typeof draft !== "object" ||
    draft === null ||
    typeof remote !== "object" ||
    remote === null ||
    Array.isArray(draft)
  )
    return cloneData(draft);
  const result = { ...remote };
  for (const key of Object.keys(draft) as (keyof T)[])
    result[key] = mergeEdited(baseline[key], draft[key], remote[key]);
  return result;
}
