import type { Bilingual } from "./notices";
import type { AchievementKind } from "@application/growth/models";
export interface RewardInputModel {
  points: string;
  itemDefinitionId: string | null;
  itemCount: number;
}
export interface CheckinValuesModel {
  basePoints: string;
  stepPoints: string;
  capPoints: string;
  normalExperience: string;
}
export interface GrowthSettingsModel {
  learningDay: string;
  masteryExperience: string;
  growthStartedAt: string | null;
  current: (CheckinValuesModel & { effectiveDay: string }) | null;
  pending: (CheckinValuesModel & { effectiveDay: string }) | null;
  revision: string;
}
export interface GrowthSettingsInput extends CheckinValuesModel {
  masteryExperience: string;
  expectedRevision: string;
}
export interface LevelInputModel {
  levelNumber: number;
  minExperience: string;
  rewardEnabled: boolean;
  reward: RewardInputModel;
}
export interface LevelConfigModel extends LevelInputModel {
  id: string;
}
export interface LevelConfigurationModel {
  items: LevelConfigModel[];
  revision: string;
}
export interface LevelChangesModel {
  expectedRevision: string;
  changes: { clientKey: string; id: string | null; value: LevelInputModel }[];
}
export interface LevelImpactModel {
  mayDowngrade: boolean;
  affectedUsers: number;
  rewardsUseLatestConfig: true;
  expiresAt: string;
  revision: string;
}
export interface AchievementFieldsModel {
  threshold: number;
  enabled: boolean;
  nameText: Bilingual;
  honorText: Bilingual;
  descriptionText: Bilingual;
  reward: RewardInputModel & { experience: string };
}
export interface AchievementConfigModel extends AchievementFieldsModel {
  id: string;
  kind: AchievementKind;
}
export interface AchievementConfigurationModel {
  kind: AchievementKind;
  items: AchievementConfigModel[];
  revision: string;
}
export interface AchievementChangesModel {
  kind: AchievementKind;
  expectedRevision: string;
  changes: {
    clientKey: string;
    id: string | null;
    value: AchievementFieldsModel;
  }[];
}
export interface SavedRowModel {
  clientKey: string;
  id: string;
}
export interface AdminGrowthPort {
  getGrowthSettings(): Promise<GrowthSettingsModel>;
  saveGrowthSettings(input: GrowthSettingsInput): Promise<GrowthSettingsModel>;
  getLevelConfiguration(): Promise<LevelConfigurationModel>;
  previewLevelChanges(input: LevelChangesModel): Promise<LevelImpactModel>;
  saveLevelChanges(input: LevelChangesModel): Promise<{
    configuration: LevelConfigurationModel;
    savedRows: SavedRowModel[];
  }>;
  clearLevelPreview(): void;
  getAchievementConfiguration(
    kind: AchievementKind,
  ): Promise<AchievementConfigurationModel>;
  saveAchievementChanges(input: AchievementChangesModel): Promise<{
    configuration: AchievementConfigurationModel;
    savedRows: SavedRowModel[];
  }>;
}
