import type {
  AccountModel,
  AdminModelModel,
  AdminUserDetailModel,
  AdminUserSummaryModel,
  AuthSessionResult,
  BatchDetailModel,
  BatchSummaryModel,
  ModelConnectionModel,
  GenerationOptionsModel,
  GenerationResultModel,
  GroupPolicyModel,
  LearningSummaryModel,
  PageModel,
  SessionSnapshot,
  UserGroupChangeModel,
  VocabularyResultModel,
} from "@application/shared/models";
import type {
  BootstrapDto,
  AuthDto,
  LoginDto,
  AccountDto,
} from "../schemas/session";
import type {
  GenerationOptionsDto,
  GenerationValidatedEventDto,
  VocabularyDto,
} from "../schemas/generation";
import type {
  BatchDetailDto,
  BatchSummaryDto,
  LearningSummaryDto,
} from "../schemas/learning";

import type {
  AdminGroupDto,
  AdminModelDto,
  AdminUserDetailDto,
  AdminUserSummaryDto,
  ModelConnectionDto,
} from "../schemas/admin";
import {
  mapCodePointSpansToSegments,
  mergePassageOccurrences,
} from "./span-mapper";

export function mapBootstrapDto(dto: BootstrapDto): SessionSnapshot {
  return {
    actor:
      dto.actor.kind === "visitor"
        ? { kind: "visitor", username: null, role: null, planCode: null }
        : {
            kind: "account",
            id: dto.actor.id,
            username: dto.actor.username,
            role: dto.actor.role,
            planCode: dto.actor.plan_code,
          },
    accountLocale: dto.ui_locale,
    supportedLocales: ["zh-CN", "en-US"],
  };
}

export function mapAuthDto(dto: AuthDto | LoginDto): AuthSessionResult {
  const welcome = "welcome" in dto ? dto.welcome : null;
  return {
    welcome: welcome
      ? {
          kind: welcome.kind,
          displayName: welcome.display_name,
          daysSinceLearning: welcome.days_since_learning,
          previousLearningAt: welcome.previous_learning_at,
        }
      : null,
    actor: {
      kind: "account",
      id: dto.actor.id,
      username: dto.actor.username,
      role: dto.actor.role,
      planCode: dto.actor.plan_code,
    },
    accountLocale: dto.ui_locale,
    supportedLocales: ["zh-CN", "en-US"],
  };
}

export function mapAccountDto(dto: AccountDto): AccountModel {
  const a = dto.account;
  return {
    username: a.username,
    nickname: a.nickname,
    displayName: a.display_name,
    gender: a.gender,
    planCode: a.base_plan_code,
    effectivePlanCode: a.effective_plan_code,
    uiLocale: a.ui_locale,
    lastLoginAt: a.last_login_at,
    lastLearningAt: a.last_learning_at,
  };
}

export function mapVocabularyDto(dto: VocabularyDto): VocabularyResultModel {
  return {
    entries: dto.items.map((item) => item.entry),
    vocabularyVersion: dto.vocabulary_version,
  };
}

export function mapGenerationOptionsDto(
  dto: GenerationOptionsDto,
): GenerationOptionsModel {
  return {
    models: dto.models.map((model) => ({
      id: model.id,
      name: model.name,
      description: model.description,
      access: {
        fromPlan: model.access.from_plan,
        cardEndsAt: model.access.card_ends_at,
      },
    })),
    meaningLanguages: [...dto.meaning_languages],
    scenarios: [...dto.scenarios],
    lengths: [...dto.lengths],
    maxEntries: dto.max_entries,
    effectivePlan: {
      code: dto.effective_plan.code,
      origin: dto.effective_plan.origin,
      trialEndsAt: dto.effective_plan.trial_ends_at,
    },
    extraQuota: {
      remaining: dto.extra_quota.remaining,
      earliestExpiresAt: dto.extra_quota.earliest_expires_at,
    },
    availability: dto.availability.can_generate
      ? { canGenerate: true, reason: null }
      : { canGenerate: false, reason: dto.availability.reason },
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
  };
}

export function mapGenerationResultDto(
  result: GenerationValidatedEventDto["result"],
): GenerationResultModel {
  const targets = result.targets.map((target) => ({
    entry: target.entry,
    entryMeaning: target.entry_meaning,
    hintPhrase: target.hint_phrase,
    hintSegments: mapCodePointSpansToSegments(
      target.hint_phrase,
      target.hint_blanks,
    ),
  }));
  return {
    passage: result.passage,
    passageSegments: mergePassageOccurrences(
      result.passage,
      result.targets.map((target) => target.occurrences),
    ),
    tags: [...result.tags],
    targets,
  };
}

export function mapGenerationValidatedDto(
  dto: GenerationValidatedEventDto,
): GenerationResultModel {
  return mapGenerationResultDto(dto.result);
}

export function mapLearningSummaryDto(
  dto: LearningSummaryDto,
): LearningSummaryModel {
  return {
    generationCount: dto.generation_count,
    uniqueLearnedEntries: dto.unique_learned_entries,
    participatingBatches: dto.participating_batches,
    pausedBatches: dto.paused_batches,
    successfulReviewCount: dto.successful_review_count,
    batchesEverReviewedSuccessfully: dto.batches_ever_reviewed_successfully,
  };
}

export function mapBatchSummaryDto(dto: BatchSummaryDto): BatchSummaryModel {
  return {
    id: dto.id,
    title: dto.title,
    titleRevision: dto.title_revision,
    savedAt: dto.saved_at,
    passagePreview: dto.passage_preview,
    tags: [...dto.tags],
    entries: [...dto.entries],
    modelName: dto.model.name,
    meaningLanguage: dto.meaning_language,
    scenario: dto.scenario,
    length: dto.length,
    participatesInRangeReview: dto.participates_in_range_review,
    singleBatchReview:
      dto.single_batch_review === undefined
        ? null
        : {
            action: dto.single_batch_review.action,
            sessionId: dto.single_batch_review.session_id,
          },
  };
}

export function mapBatchPageDto(
  dtos: BatchSummaryDto[],
  meta: { next_cursor: string | null; has_more: boolean },
): PageModel<BatchSummaryModel> {
  return {
    items: dtos.map(mapBatchSummaryDto),
    nextCursor: meta.next_cursor,
    hasMore: meta.has_more,
  };
}

export function mapBatchDetailDto(dto: BatchDetailDto): BatchDetailModel {
  return {
    id: dto.id,
    title: dto.title,
    titleRevision: dto.title_revision,
    savedAt: dto.saved_at,
    titleMaxLength: dto.title_max_length,
    configuration: {
      modelName: dto.configuration.model.name,
      meaningLanguage: dto.configuration.meaning_language,
      scenario: dto.configuration.scenario,
      length: dto.configuration.length,
    },
    participatesInRangeReview: dto.participates_in_range_review,
    passage: dto.passage,
    passageSegments: mergePassageOccurrences(
      dto.passage,
      dto.targets.map((target) => target.occurrences),
    ),
    tags: [...dto.tags],
    targets: dto.targets.map((target) => ({
      entry: target.entry,
      entryMeaning: target.entry_meaning,
      hintPhrase: target.hint_phrase,
      hintSegments: mapCodePointSpansToSegments(
        target.hint_phrase,
        target.hint_blanks,
      ),
    })),
    reviewSummary: {
      completedCount: dto.review_summary.completed_count,
      successfulCount: dto.review_summary.successful_count,
      lastCompletedAt: dto.review_summary.last_completed_at,
    },
  };
}

export function mapModelConnectionDto(
  dto: ModelConnectionDto,
): ModelConnectionModel {
  return {
    id: dto.id,
    name: dto.name,
    protocol: dto.protocol,
    baseUrl: dto.base_url,
    credentialConfigured: dto.credential_configured,
    maskedHint: dto.masked_hint,
  };
}

export function mapAdminModelDto(
  dto: AdminModelDto,
  revision: string,
): AdminModelModel {
  return {
    id: dto.id,
    displayName: dto.display_name,
    description: dto.description,
    revision,
    retiredAt: dto.retired_at,
    providerModelId: dto.provider_model_id,
    connection: mapModelConnectionDto(dto.connection),
    maxOutputTokens: dto.max_output_tokens,
    outputMode: dto.output_mode,
    enabled: dto.enabled,
    assignedGroupCodes: [...dto.assigned_group_codes],
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

export function mapGroupDto(
  dto: AdminGroupDto,
  revision: string,
): GroupPolicyModel {
  return {
    code: dto.code,
    priority: dto.priority,
    revision,
    rolling24hLimit: dto.rolling_24h_limit,
    maxEntries: dto.max_entries,
    allowedLengths: [...dto.allowed_lengths],
    models: dto.models.map((model) => ({
      id: model.id,
      displayName: model.display_name,
      enabled: model.enabled,
    })),
  };
}

export function mapAdminUserSummaryDto(
  dto: AdminUserSummaryDto,
): AdminUserSummaryModel {
  return {
    id: dto.id,
    username: dto.username,
    role: dto.role,
    planCode: dto.plan_code,
    status: dto.status,
    createdAt: dto.created_at,
  };
}

export function mapAdminUserDetailDto(
  dto: AdminUserDetailDto,
): AdminUserDetailModel {
  return {
    ...mapAdminUserSummaryDto(dto),
    uiLocale: dto.ui_locale,
    nickname: dto.nickname,
    gender: dto.gender,
    lastLoginAt: dto.last_login_at,
    lastLearningAt: dto.last_learning_at,
    baseRevision: dto.base_revision,
    effectivePlanCode: dto.effective_plan_code,
    growth: dto.growth
      ? {
          levelNumber: dto.growth.level_number,
          points: dto.growth.points,
          experience: dto.growth.experience,
          masteredTotal: dto.growth.mastered_total,
          savedTotal: dto.growth.saved_total,
        }
      : null,
    learningBatchCount: dto.learning_batch_count,
    generationQuota:
      dto.role === "admin"
        ? { kind: "not_applicable" }
        : dto.generation_quota.kind === "limited"
          ? { kind: "limited", remaining: dto.generation_quota.remaining }
          : { kind: "unlimited" },
  };
}

export function mapUserGroupChangeDto(dto: {
  user: AdminUserDetailDto;
  quota_reset: true;
}): UserGroupChangeModel {
  return { user: mapAdminUserDetailDto(dto.user), quotaReset: true };
}
