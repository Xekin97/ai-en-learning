import type {
  AccountModel,
  ActiveRangeModel,
  AdminModelModel,
  AdminUserDetailModel,
  AdminUserSummaryModel,
  AuthSessionResult,
  BatchDetailModel,
  BatchSummaryModel,
  CredentialStatusModel,
  GenerationOptionsModel,
  GenerationResultModel,
  GroupPolicyModel,
  LearningSummaryModel,
  PageModel,
  ReviewActionOutcomeModel,
  ReviewAttemptModel,
  ReviewBatchProjectionModel,
  ReviewItemModel,
  ReviewItemProgressModel,
  ReviewProgressModel,
  ReviewRangePreviewModel,
  ReviewSessionCreatedModel,
  ReviewSessionModel,
  ClozeGroupRef,
  SessionSnapshot,
  UserGroupChangeModel,
  VocabularyResultModel,
} from "@application/shared/models";
import type { BootstrapDto, AuthDto, AccountDto } from "../schemas/session";
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
  ActiveRangeDto,
  ReviewActionOutcomeDto,
  ReviewAttemptDto,
  ReviewItemDto,
  ReviewRangePreviewDto,
  ReviewSessionCreatedDto,
  ReviewSessionDto,
} from "../schemas/review";
import type {
  AdminGroupDto,
  AdminModelDto,
  AdminUserDetailDto,
  AdminUserSummaryDto,
  CredentialDto,
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
            username: dto.actor.username,
            role: dto.actor.role,
            planCode: dto.actor.plan_code,
          },
    accountLocale: dto.ui_locale,
    supportedLocales: [...dto.supported_ui_locales],
  };
}

export function mapAuthDto(dto: AuthDto): AuthSessionResult {
  return {
    actor: {
      kind: "account",
      username: dto.actor.username,
      role: dto.actor.role,
      planCode: dto.actor.plan_code,
    },
    accountLocale: dto.ui_locale,
    supportedLocales: ["zh-CN", "en-US"],
  };
}

export function mapAccountDto(dto: AccountDto): AccountModel {
  return {
    username: dto.username,
    planCode: dto.plan_code,
    uiLocale: dto.ui_locale,
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
    })),
    meaningLanguages: [...dto.meaning_languages],
    scenarios: [...dto.scenarios],
    lengths: [...dto.lengths],
    maxEntries: dto.max_entries,
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

export function mapGenerationValidatedDto(
  dto: GenerationValidatedEventDto,
): GenerationResultModel {
  const targets = dto.result.targets.map((target) => ({
    entry: target.entry,
    entryMeaning: target.entry_meaning,
    hintPhrase: target.hint_phrase,
    hintSegments: mapCodePointSpansToSegments(
      target.hint_phrase,
      target.hint_blanks,
    ),
  }));
  return {
    passage: dto.result.passage,
    passageSegments: mergePassageOccurrences(
      dto.result.passage,
      dto.result.targets.map((target) => target.occurrences),
    ),
    tags: [...dto.result.tags],
    targets,
  };
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
    savedAt: dto.saved_at,
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

function mapProgress(dto: {
  completed_batches: number;
  total_batches: number;
  successful_batches: number;
  unsuccessful_batches: number;
}): ReviewProgressModel {
  return {
    completedBatches: dto.completed_batches,
    totalBatches: dto.total_batches,
    successfulBatches: dto.successful_batches,
    unsuccessfulBatches: dto.unsuccessful_batches,
  };
}

function mapDateRange(dto: {
  start_date: string;
  end_date: string;
  timezone: string;
}) {
  return {
    startDate: dto.start_date,
    endDate: dto.end_date,
    timezone: dto.timezone,
  };
}

function mapBatchProjection(dto: {
  batch_id: string;
  saved_at: string;
  scenario: ReviewBatchProjectionModel["scenario"];
}): ReviewBatchProjectionModel {
  return {
    batchId: dto.batch_id,
    savedAt: dto.saved_at,
    scenario: dto.scenario,
  };
}

function mapSummary(dto: {
  total_batches: number;
  successful_batches: number;
  unsuccessful_batches: number;
  skipped_batches: number;
}) {
  return {
    totalBatches: dto.total_batches,
    successfulBatches: dto.successful_batches,
    unsuccessfulBatches: dto.unsuccessful_batches,
    skippedBatches: dto.skipped_batches,
  };
}

export function mapReviewRangePreviewDto(
  dto: ReviewRangePreviewDto,
): ReviewRangePreviewModel {
  return {
    batchCount: dto.batch_count,
    entryCount: dto.entry_count,
    empty: dto.empty,
  };
}

export function mapActiveRangeDto(dto: ActiveRangeDto): ActiveRangeModel {
  return {
    sessionId: dto.session_id,
    dateRange: mapDateRange(dto.date_range),
    progress: mapProgress(dto.progress),
  };
}

export function mapReviewSessionDto(dto: ReviewSessionDto): ReviewSessionModel {
  if (dto.status === "active") {
    return {
      sessionId: dto.session_id,
      mode: dto.mode,
      status: "active",
      dateRange: dto.date_range ? mapDateRange(dto.date_range) : null,
      progress: mapProgress(dto.progress),
      currentBatch: mapBatchProjection(dto.current_batch),
      summary: null,
    };
  }
  return {
    sessionId: dto.session_id,
    mode: dto.mode,
    status: "completed",
    dateRange: dto.date_range ? mapDateRange(dto.date_range) : null,
    progress: mapProgress(dto.progress),
    currentBatch: null,
    summary: mapSummary(dto.summary),
  };
}

export function mapReviewSessionCreatedDto(
  dto: ReviewSessionCreatedDto,
): ReviewSessionCreatedModel {
  return {
    reused: dto.reused,
    session: {
      sessionId: dto.session_id,
      mode: dto.mode,
      status: "active",
      dateRange: dto.date_range ? mapDateRange(dto.date_range) : null,
      progress: mapProgress(dto.progress),
      currentBatch: mapBatchProjection(dto.current_batch),
      summary: null,
    },
  };
}

export function mapReviewItemDto(dto: ReviewItemDto): ReviewItemModel {
  if (dto.stage === "spelling") {
    return {
      stage: "spelling",
      itemId: dto.item_id,
      entryMeaning: dto.entry_meaning,
      hintSegments: dto.hint.segments.map((segment) =>
        segment.kind === "text"
          ? { kind: "text" as const, text: segment.text }
          : { kind: "blank" as const, lengthHint: segment.length_hint },
      ),
    };
  }
  const localGroups = new Map<string, ClozeGroupRef>();
  const groupRefFor = (transportKey: string): ClozeGroupRef => {
    const existing = localGroups.get(transportKey);
    if (existing) return existing;
    const localRef = `cloze-group-${localGroups.size}` as ClozeGroupRef;
    localGroups.set(transportKey, localRef);
    return localRef;
  };
  return {
    stage: "passage_cloze",
    itemId: dto.item_id,
    passageSegments: dto.passage_segments.map((segment) =>
      segment.kind === "text"
        ? { kind: "text" as const, text: segment.text }
        : {
            kind: "blank" as const,
            blankId: segment.blank_id,
            groupRef: groupRefFor(segment.group_key),
          },
    ),
  };
}

function mapItemProgress(dto: {
  stage: "spelling" | "passage_cloze";
  item_number: number;
  items_in_stage: number;
}): ReviewItemProgressModel {
  return {
    stage: dto.stage,
    itemNumber: dto.item_number,
    itemsInStage: dto.items_in_stage,
  };
}

export function mapReviewAttemptDto(dto: ReviewAttemptDto): ReviewAttemptModel {
  return {
    attemptId: dto.attempt_id,
    item: mapReviewItemDto(dto.item),
    progress: mapItemProgress(dto.progress),
  };
}

export function mapReviewActionDto(
  dto: ReviewActionOutcomeDto,
): ReviewActionOutcomeModel {
  switch (dto.outcome) {
    case "retry":
      return {
        outcome: "retry",
        item: mapReviewItemDto(dto.item),
        progress: mapItemProgress(dto.progress),
        incorrectBlankIds: dto.incorrect_blank_ids,
      };
    case "advanced":
      return {
        outcome: "advanced",
        result: dto.result,
        item: mapReviewItemDto(dto.item),
        progress: mapItemProgress(dto.progress),
      };
    case "batch_completed":
      return {
        outcome: "batch_completed",
        batchResult: {
          batchId: dto.batch_result.batch_id,
          successful: dto.batch_result.successful,
          errorCount: dto.batch_result.error_count,
          skipCount: dto.batch_result.skip_count,
        },
        sessionProgress: mapProgress(dto.session_progress),
        nextBatch: mapBatchProjection(dto.next_batch),
      };
    case "session_completed":
      return {
        outcome: "session_completed",
        batchResult: {
          batchId: dto.batch_result.batch_id,
          successful: dto.batch_result.successful,
          errorCount: dto.batch_result.error_count,
          skipCount: dto.batch_result.skip_count,
        },
        sessionProgress: mapProgress(dto.session_progress),
        sessionSummary: mapSummary(dto.session_summary),
      };
  }
}

export function mapCredentialDto(dto: CredentialDto): CredentialStatusModel {
  return {
    configured: dto.configured,
    maskedHint: dto.masked_hint,
    updatedAt: dto.updated_at,
  };
}

export function mapAdminModelDto(dto: AdminModelDto): AdminModelModel {
  return {
    id: dto.id,
    displayName: dto.display_name,
    description: dto.description,
    openRouterModelId: dto.openrouter_model_id,
    enabled: dto.enabled,
    assignedGroupCodes: [...dto.assigned_group_codes],
    createdAt: dto.created_at,
    updatedAt: dto.updated_at,
  };
}

export function mapGroupDto(dto: AdminGroupDto): GroupPolicyModel {
  return {
    code: dto.code,
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
