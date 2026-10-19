import type {
  AdminPresetModel,
  AdminPreviewOptions,
} from "@application/admin/presets";
import type {
  AdminPresetDto,
  AdminGenerationOptionsDto,
} from "../schemas/admin-presets";
import { mapGenerationResultDto } from "./index";
import { mapUsage } from "./analytics-mapper";
export const mapPresetConfiguration = (
  d: AdminPresetDto["configuration"],
): AdminPresetModel["configuration"] => ({
  model: { id: d.model.id, name: d.model.name },
  entries: [...d.entries],
  meaningLanguage: d.meaning_language,
  scenario: d.scenario,
  length: d.length,
});
export function mapAdminPreset(d: AdminPresetDto): AdminPresetModel {
  return {
    id: d.id,
    draftVersion: d.draft_version,
    publishedVersion: d.published_version,
    listed: d.listed,
    title: d.title,
    previewContentMode: d.preview_content_mode,
    configuration: mapPresetConfiguration(d.configuration),
    draftState: d.draft_state,
    hasUnpublishedChanges: d.has_unpublished_changes,
    preview: d.preview
      ? {
          runId: d.preview.preview_run_id,
          completedAt: d.preview.completed_at,
          result: mapGenerationResultDto(d.preview.result),
          usage: mapUsage(d.preview.usage),
          previewContentMode: d.preview.preview_content_mode,
          finalContentVersion: d.preview.final_content_version,
          contentOutcome: d.preview.content_outcome,
          completionNotice: d.preview.completion_notice,
        }
      : null,
    published: d.published
      ? {
          title: d.published.title,
          configuration: mapPresetConfiguration(d.published.configuration),
          sample: mapGenerationResultDto(d.published.sample),
          versionCreatedAt: d.published.version_created_at,
          finalContentVersion: d.published.final_content_version,
          contentOutcome: d.published.content_outcome,
          completionNotice: d.published.completion_notice,
        }
      : null,
  };
}
export function mapAdminGenerationOptions(
  d: AdminGenerationOptionsDto,
): AdminPreviewOptions {
  return {
    models: d.models.map((m) => ({
      id: m.id,
      name: m.name,
      description: m.description,
    })),
    meaningLanguages: [...d.meaning_languages],
    scenarios: [...d.scenarios],
    lengths: [...d.lengths],
    vocabularyVersion: d.vocabulary_version,
    revision: d.revision,
    availability: d.availability.can_preview
      ? { kind: "ready" }
      : {
          kind: "blocked",
          reason:
            d.availability.reason === "credential_missing"
              ? "credentialMissing"
              : "noModels",
        },
    previewContentModes: [...d.preview_content_modes],
    defaultPreviewContentMode: d.default_preview_content_mode,
    previewContentRepairLimit: d.preview_content_repair_limit,
    nativeCorrectionPolicy: {
      version: d.native_correction_policy.version,
      scope: d.native_correction_policy.scope,
      maxCalls: d.native_correction_policy.max_calls,
      editable: d.native_correction_policy.editable,
    },
  };
}
