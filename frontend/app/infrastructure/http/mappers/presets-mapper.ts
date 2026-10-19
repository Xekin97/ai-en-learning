import type {
  PresetModel,
  PresetDetailModel,
} from "@application/presets/models";
import type { PresetDto, PresetDetailDto } from "../schemas/presets";
import { mapGenerationResultDto } from "./index";
export function mapPreset(dto: PresetDto): PresetModel {
  return {
    id: dto.id,
    title: dto.title,
    publishedVersion: dto.published_version,
    versionCreatedAt: dto.version_created_at,
    configuration: {
      model: {
        id: dto.configuration.model.id,
        name: dto.configuration.model.name,
      },
      entries: [...dto.configuration.entries],
      meaningLanguage: dto.configuration.meaning_language,
      scenario: dto.configuration.scenario,
      length: dto.configuration.length,
    },
    sample: mapGenerationResultDto(dto.sample),
    availability: {
      canGenerate: dto.availability.can_generate,
      reason: dto.availability.reason,
    },
  };
}
export function mapPresetDetail(dto: PresetDetailDto): PresetDetailModel {
  return {
    preset: mapPreset(dto.preset),
    quota:
      dto.quota.kind === "unlimited"
        ? { kind: "unlimited", windowHours: 24 }
        : {
            kind: "limited",
            limit: dto.quota.limit,
            remaining: dto.quota.remaining,
            windowHours: 24,
            refreshesAt: dto.quota.refreshes_at,
          },
    extraQuota: {
      remaining: dto.extra_quota.remaining,
      earliestExpiresAt: dto.extra_quota.earliest_expires_at,
    },
    canStart: dto.can_start,
    blockReason: dto.block_reason,
    effectivePlan: {
      code: dto.effective_plan.code,
      origin: dto.effective_plan.origin,
      trialEndsAt: dto.effective_plan.trial_ends_at,
    },
    configurationRevision: dto.configuration_revision,
    contentService: dto.content_service.content_review_enabled
      ? {
          nativeValidation: true,
          contentReviewEnabled: true,
          contentRepairLimit: dto.content_service.content_repair_limit,
        }
      : {
          nativeValidation: true,
          contentReviewEnabled: false,
          contentRepairLimit: 0,
        },
    nativeCorrectionPolicy: {
      version: dto.native_correction_policy.version,
      scope: dto.native_correction_policy.scope,
      maxCalls: dto.native_correction_policy.max_calls,
      editable: dto.native_correction_policy.editable,
    },
  };
}
