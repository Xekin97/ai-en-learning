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
    configuration: mapPresetConfiguration(d.configuration),
    draftState: d.draft_state,
    hasUnpublishedChanges: d.has_unpublished_changes,
    preview: d.preview
      ? {
          runId: d.preview.preview_run_id,
          completedAt: d.preview.completed_at,
          result: mapGenerationResultDto(d.preview.result),
          usage: mapUsage(d.preview.usage),
        }
      : null,
    published: d.published
      ? {
          title: d.published.title,
          configuration: mapPresetConfiguration(d.published.configuration),
          sample: mapGenerationResultDto(d.published.sample),
          versionCreatedAt: d.published.version_created_at,
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
  };
}
