import type {
  GenerationResultModel,
  MeaningLanguage,
  Scenario,
  PassageLength,
  PageModel,
  PlanPreviewItemModel,
  ContentActivityModel,
  ContentDraftEventModel,
  ContentDraftStateModel,
  ContentOutcomeModel,
  CompletionNoticeModel,
  NativePolicyModel,
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
  previewContentModes: ["basic", "enhanced"];
  defaultPreviewContentMode: "basic";
  previewContentRepairLimit: 1;
  nativeCorrectionPolicy: NativePolicyModel;
}
export interface PresetInputModel {
  title: string;
  previewContentMode: "basic" | "enhanced";
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
  previewContentMode: "basic" | "enhanced";
  configuration: PresetModel["configuration"];
  draftState: "needs_preview" | "preview_ready";
  hasUnpublishedChanges: boolean;
  preview: {
    runId: string;
    completedAt: string;
    result: GenerationResultModel;
    usage: UsageSummaryModel;
    previewContentMode: "basic" | "enhanced";
    finalContentVersion: number | null;
    contentOutcome: ContentOutcomeModel | null;
    completionNotice: CompletionNoticeModel;
  } | null;
  published: {
    title: string;
    configuration: PresetModel["configuration"];
    sample: GenerationResultModel;
    versionCreatedAt: string;
    finalContentVersion: number | null;
    contentOutcome: ContentOutcomeModel | null;
    completionNotice: CompletionNoticeModel;
  } | null;
}
export interface AdminPresetRecord {
  preset: AdminPresetModel;
  revision: string;
}
export type PreviewEventModel =
  | {
      kind: "started";
      seq: 1;
      runId: string;
      streamId: string;
      draftVersion: string;
      mode: "basic" | "enhanced";
      contentService: import("@application/shared/models").ContentServiceModel;
      nativeCorrectionPolicy: NativePolicyModel;
    }
  | {
      kind: "progress";
      seq: number;
      phase: "planning" | "composing" | "finalizing";
    }
  | {
      kind: "plan_item";
      seq: number;
      planId: string;
      meaningLanguage: MeaningLanguage;
      item: PlanPreviewItemModel;
    }
  | { kind: "activity"; seq: number; activity: ContentActivityModel }
  | ContentDraftEventModel
  | {
      kind: "edit";
      seq: number;
      draftId: string;
      contentVersion: number;
      baseRev: number;
      rev: number;
      at: number;
      deleteCount: number;
      insert: string;
      source: "provider" | "retained";
    }
  | {
      kind: "validated";
      seq: number;
      runId: string;
      draftVersion: string;
      result: GenerationResultModel;
      usage: UsageSummaryModel;
      mode: "basic" | "enhanced";
      finalContentVersion: number;
      contentOutcome: ContentOutcomeModel;
      completionNotice: CompletionNoticeModel;
    }
  | {
      kind: "failed";
      seq: number;
      code: string;
      retryable: boolean;
      requestId: string;
    }
  | { kind: "cancelled"; seq: number }
  | { kind: "settlement_pending"; seq: number; requestId: string };
export interface PreviewStreamState {
  phase:
    | "idle"
    | "starting"
    | "streaming"
    | "pending"
    | "validated"
    | "failed"
    | "cancelled";
  runId: string | null;
  text: string;
  draft: ContentDraftStateModel;
  activity: ContentActivityModel | null;
  presetId: string | null;
  draftVersion: string | null;
  planId: string | null;
  planMeaningLanguage: MeaningLanguage | null;
  planItems: PlanPreviewItemModel[];
  lastSeq: number;
  lastFrame: string | null;
  requestPhase: "accepted" | "planning" | "composing" | "finalizing" | null;
  mode: "basic" | "enhanced" | null;
  acceptedContentService:
    import("@application/shared/models").ContentServiceModel | null;
  result: GenerationResultModel | null;
  finalContentVersion: number | null;
  contentOutcome: ContentOutcomeModel | null;
  completionNotice: CompletionNoticeModel;
  usage: UsageSummaryModel | null;
  resultUnavailable: boolean;
}
export interface PreviewUsageModel {
  runId: string;
  presetId: string | null;
  draftVersion: string | null;
  status: "active" | "valid" | "failed" | "cancelled";
  startedAt: string;
  completedAt: string | null;
  usage: UsageSummaryModel;
}
export type PreviewStatusModel = {
  runId: string;
  draftVersion: string;
  mode: "basic" | "enhanced";
  usage: UsageSummaryModel;
} & (
  | { status: "active" }
  | {
      status: "valid";
      finalContentVersion: number;
      result: GenerationResultModel | null;
      contentOutcome: ContentOutcomeModel;
      completionNotice: CompletionNoticeModel;
    }
  | { status: "failed" | "cancelled" }
);
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
    mode: "basic" | "enhanced",
    onEvent: (event: PreviewEventModel) => void,
    signal: AbortSignal,
  ): Promise<void>;
  cancelPresetPreview(runId: string): Promise<"cancelled" | "valid" | "failed">;
  getPresetPreviewStatus(
    runId: string,
    signal?: AbortSignal,
  ): Promise<PreviewStatusModel>;
  clearPresetPreview(runId: string): void;
  listPresetPreviewUsage(
    startDate: string,
    endDate: string,
    cursor?: string,
  ): Promise<PageModel<PreviewUsageModel> & { summary: UsageSummaryModel }>;
}
