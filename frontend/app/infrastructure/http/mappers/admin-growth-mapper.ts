import type {
  GrowthSettingsDto,
  LevelDto,
  AchievementConfigDto,
} from "../schemas/admin-growth";
import type {
  GrowthSettingsModel,
  LevelConfigModel,
  AchievementConfigModel,
  RewardInputModel,
  AchievementFieldsModel,
  LevelInputModel,
} from "@application/admin/growth";
import type { Bilingual } from "@application/admin/notices";
import { bilingual } from "./admin-notice-mapper";
export function mapGrowthSettings(d: GrowthSettingsDto): GrowthSettingsModel {
  const rule = (r: NonNullable<GrowthSettingsDto["current"]>) => ({
    effectiveDay: r.effective_day,
    basePoints: r.base_points,
    stepPoints: r.step_points,
    capPoints: r.cap_points,
    normalExperience: r.normal_experience,
  });
  return {
    learningDay: d.learning_day,
    masteryExperience: d.mastery_experience,
    growthStartedAt: d.growth_started_at,
    current: d.current ? rule(d.current) : null,
    pending: d.pending ? rule(d.pending) : null,
    revision: d.revision,
  };
}
const reward = (d: LevelDto["reward"]): RewardInputModel => ({
  points: d.points,
  itemDefinitionId: d.item_definition_id,
  itemCount: d.item_count,
});
export function mapLevel(d: LevelDto): LevelConfigModel {
  return {
    id: d.id,
    levelNumber: d.level_number,
    minExperience: d.min_experience,
    rewardEnabled: d.reward_enabled,
    reward: reward(d.reward),
  };
}
export function mapAchievementConfig(
  d: AchievementConfigDto,
): AchievementConfigModel {
  return {
    id: d.id,
    kind: d.kind,
    threshold: d.threshold,
    enabled: d.enabled,
    nameText: bilingual(d.name),
    honorText: bilingual(d.title),
    descriptionText: bilingual(d.description),
    reward: { ...reward(d.reward), experience: d.reward.experience },
  };
}
export const rewardBody = (r: RewardInputModel) => ({
  points: r.points,
  item_definition_id: r.itemDefinitionId,
  item_count: r.itemDefinitionId ? r.itemCount : 0,
});
export const levelBody = (l: LevelInputModel) => ({
  level_number: l.levelNumber,
  min_experience: l.minExperience,
  reward_enabled: l.rewardEnabled,
  reward: rewardBody(l.reward),
});
const names = (text: Bilingual) => ({
  zh_CN: text.zh?.trim() || null,
  en_US: text.en?.trim() || null,
});
const descriptions = (text: Bilingual) => ({
  zh_CN: text.zh?.trim() ? text.zh : null,
  en_US: text.en?.trim() ? text.en : null,
});
export const achievementBody = (a: AchievementFieldsModel) => ({
  threshold: a.threshold,
  enabled: a.enabled,
  name: names(a.nameText),
  title: names(a.honorText),
  description: descriptions(a.descriptionText),
  reward: { ...rewardBody(a.reward), experience: a.reward.experience },
});
