import type {
  GenerationResultModel,
  MeaningLanguage,
  Scenario,
  PassageLength,
  PageModel,
} from "@application/shared/models";
import type { PresetModel } from "@application/presets/models";
import type { UsageSummaryModel } from "./usage";
export interface AdminPreviewOptions {
  models: { id: string; name: string; description: string | null }[];
  meaningLanguages: MeaningLanguage[];
  scenarios: Scenario[];
  lengths: PassageLength[];
  vocabularyVersion: string;
  revision: string;
  availability:
    | { kind: "ready" }
    | { kind: "blocked"; reason: "credentialMissing" | "noModels" };
}
export interface PresetInputModel {
  title: string;
  configuration: {
    modelId: string;
    entries: string[];
    meaningLanguage: MeaningLanguage;
    scenario: Scenario;
    length: PassageLength;
  };
}
export interface AdminPresetModel {
  id: string;
  draftVersion: string;
  publishedVersion: string | null;
  listed: boolean;
  title: string;
  configuration: PresetModel["configuration"];
  draftState: "needs_preview" | "preview_ready";
  hasUnpublishedChanges: boolean;
  preview: {
    runId: string;
    completedAt: string;
    result: GenerationResultModel;
    usage: UsageSummaryModel;
  } | null;
  published: {
    title: string;
    configuration: PresetModel["configuration"];
    sample: GenerationResultModel;
    versionCreatedAt: string;
  } | null;
}
export interface AdminPresetRecord {
  preset: AdminPresetModel;
  revision: string;
}
export type PreviewEventModel =
  | { kind: "started"; runId: string }
  | { kind: "delta"; text: string }
  | {
      kind: "validated";
      runId: string;
      draftVersion: string;
      result: GenerationResultModel;
      usage: UsageSummaryModel;
    }
  | { kind: "failed"; code: string; retryable: boolean; requestId: string }
  | { kind: "cancelled" };
export interface PreviewUsageModel {
  runId: string;
  presetId: string | null;
  draftVersion: string | null;
  status: "active" | "valid" | "failed" | "cancelled";
  startedAt: string;
  completedAt: string | null;
  usage: UsageSummaryModel;
}
export interface AdminPresetsPort {
  getAdminGenerationOptions(): Promise<AdminPreviewOptions>;
  listAdminPresets(
    cursor?: string,
  ): Promise<PageModel<AdminPresetModel> & { revision: string }>;
  getAdminPreset(id: string): Promise<AdminPresetRecord>;
  saveAdminPreset(
    input: PresetInputModel,
    id?: string,
    expectedRevision?: string,
  ): Promise<AdminPresetRecord>;
  publishAdminPreset(
    id: string,
    draftVersion: string,
    expectedRevision: string,
  ): Promise<AdminPresetRecord>;
  unpublishAdminPreset(
    id: string,
    expectedRevision: string,
  ): Promise<AdminPresetRecord>;
  streamPresetPreview(
    id: string,
    draftVersion: string,
    onEvent: (event: PreviewEventModel) => void,
    signal: AbortSignal,
  ): Promise<void>;
  cancelPresetPreview(runId: string): Promise<"cancelled" | "valid" | "failed">;
  clearPresetPreview(runId: string): void;
  listPresetPreviewUsage(
    startDate: string,
    endDate: string,
    cursor?: string,
  ): Promise<PageModel<PreviewUsageModel> & { summary: UsageSummaryModel }>;
}
