import type {
  GenerationResultModel,
  MeaningLanguage,
  Scenario,
  PassageLength,
  QuotaModel,
  PageModel,
} from "@application/shared/models";
export interface PresetModel {
  id: string;
  title: string;
  publishedVersion: string;
  versionCreatedAt: string;
  configuration: {
    model: { id: string; name: string };
    entries: string[];
    meaningLanguage: MeaningLanguage;
    scenario: Scenario;
    length: PassageLength;
  };
  sample: GenerationResultModel;
  availability: {
    canGenerate: boolean;
    reason:
      | "model_unavailable"
      | "credential_missing"
      | "configuration_invalid"
      | null;
  };
}
export interface PresetDetailModel {
  preset: PresetModel;
  quota: QuotaModel;
  extraQuota: { remaining: number; earliestExpiresAt: string | null };
  canStart: boolean;
  blockReason: string | null;
}
export interface PresetsPort {
  listPresets(
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<PageModel<PresetModel>>;
  getPreset(id: string, signal?: AbortSignal): Promise<PresetDetailModel>;
}
