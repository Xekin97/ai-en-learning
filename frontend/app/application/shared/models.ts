export type UiLocale = "zh-CN" | "en-US";
export type ActorRole = "learner" | "admin";
export type PlanCode = "basic" | "pro" | "plus";
export type GroupCode = "visitor" | PlanCode;
export type MeaningLanguage = "zh" | "en" | "ja";
export type Scenario = "discussion" | "story" | "business" | "news";
export type PassageLength = "short" | "medium" | "long" | "xlong";

export type ActorModel =
  | { kind: "visitor"; username: null; role: null; planCode: null }
  | {
      kind: "account";
      id: string;
      username: string;
      role: ActorRole;
      planCode: PlanCode | null;
    };

export interface SessionSnapshot {
  actor: ActorModel;
  accountLocale: UiLocale | null;
  supportedLocales: UiLocale[];
}

export interface WelcomeModel {
  kind: "no_learning" | "same_day" | "returning";
  displayName: string;
  daysSinceLearning: number | null;
  previousLearningAt: string | null;
}
export interface AuthSessionResult extends SessionSnapshot {
  welcome: WelcomeModel | null;
}

export type RequestStatus = "idle" | "loading" | "ready" | "empty" | "failed";

export type FailureKind =
  | "authentication_required"
  | "invalid_credentials"
  | "forbidden"
  | "csrf_failed"
  | "validation"
  | "quota_exhausted"
  | "generation_in_progress"
  | "generation_unavailable"
  | "not_found"
  | "capability_expired"
  | "conflict"
  | "network"
  | "contract_violation"
  | "service_unavailable"
  | "unknown";

export interface AppFailure {
  kind: FailureKind;
  code: string;
  status: number | null;
  requestId: string | null;
  fields: Readonly<Record<string, string>>;
  retryable: boolean;
}

export interface ModelOptionModel {
  id: string;
  name: string;
  description: string | null;
}

export type QuotaModel =
  | { kind: "unlimited"; windowHours: 24 }
  | {
      kind: "limited";
      limit: number;
      remaining: number;
      windowHours: 24;
      refreshesAt: string | null;
    };

export type GenerationAvailabilityReason =
  | "credential_missing"
  | "no_models"
  | "no_lengths"
  | "quota_disabled"
  | "quota_exhausted"
  | "generation_in_progress";

export interface GenerationOptionsModel {
  models: (ModelOptionModel & {
    access: { fromPlan: boolean; cardEndsAt: string | null };
  })[];
  effectivePlan: {
    code: GroupCode;
    origin: "base" | "trial" | "visitor";
    trialEndsAt: string | null;
  };
  extraQuota: { remaining: number; earliestExpiresAt: string | null };
  meaningLanguages: MeaningLanguage[];
  scenarios: Scenario[];
  lengths: PassageLength[];
  maxEntries: number;
  availability:
    | { canGenerate: true; reason: null }
    | { canGenerate: false; reason: GenerationAvailabilityReason };
  quota: QuotaModel;
}

export interface VocabularyResultModel {
  entries: string[];
  vocabularyVersion: string;
}

export interface TextSegmentModel {
  kind: "text";
  text: string;
}

export interface TargetSegmentModel {
  kind: "target";
  text: string;
}

export type DisplaySegmentModel = TextSegmentModel | TargetSegmentModel;

export interface GeneratedTargetModel {
  entry: string;
  entryMeaning: string;
  hintPhrase: string;
  hintSegments: DisplaySegmentModel[];
}

export interface GenerationResultModel {
  passage: string;
  passageSegments: DisplaySegmentModel[];
  tags: string[];
  targets: GeneratedTargetModel[];
}

export interface GenerationInputModel {
  modelId: string;
  meaningLanguage: MeaningLanguage;
  scenario: Scenario;
  length: PassageLength;
  entries: string[];
}

export type GenerationRequestModel =
  | GenerationInputModel
  | { kind: "preset"; presetId: string; publishedVersion: string };

export type GenerationEventModel =
  | { kind: "started"; runId: string }
  | { kind: "delta"; text: string }
  | { kind: "validated"; runId: string; result: GenerationResultModel }
  | {
      kind: "failed";
      code: string;
      quotaRefunded: boolean;
      retryable: boolean;
      requestId: string;
    }
  | { kind: "cancelled"; quotaRefunded: false };

export type GenerationPhase =
  | "idle"
  | "streaming"
  | "valid"
  | "saved"
  | "discarded"
  | "cancelled"
  | "failed";

export interface GenerationStateModel {
  phase: GenerationPhase;
  runId: string | null;
  streamedText: string;
  result: GenerationResultModel | null;
  failure: AppFailure | null;
}

export interface SavedBatchResult {
  batchId: string;
  savedAt: string;
}

export interface VisitorClaimLease {
  expiresAt: string;
}

export interface LearningSummaryModel {
  generationCount: number;
  uniqueLearnedEntries: number;
  participatingBatches: number;
  pausedBatches: number;
  successfulReviewCount: number;
  batchesEverReviewedSuccessfully: number;
}

export interface SingleBatchReviewModel {
  action: "start" | "resume";
  sessionId: string | null;
}

export interface BatchSummaryModel {
  title: string;
  titleRevision: string;
  id: string;
  savedAt: string;
  passagePreview: string;
  tags: string[];
  entries: string[];
  modelName: string;
  meaningLanguage: MeaningLanguage;
  scenario: Scenario;
  length: PassageLength;
  participatesInRangeReview: boolean;
  singleBatchReview: SingleBatchReviewModel | null;
}

export interface PageModel<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export interface BatchTargetModel {
  entry: string;
  entryMeaning: string;
  hintPhrase: string;
  hintSegments: DisplaySegmentModel[];
}

export interface BatchDetailModel {
  title: string;
  titleRevision: string;
  titleMaxLength: number;
  id: string;
  savedAt: string;
  configuration: {
    modelName: string;
    meaningLanguage: MeaningLanguage;
    scenario: Scenario;
    length: PassageLength;
  };
  participatesInRangeReview: boolean;
  passage: string;
  passageSegments: DisplaySegmentModel[];
  tags: string[];
  targets: BatchTargetModel[];
  reviewSummary: {
    completedCount: number;
    successfulCount: number;
    lastCompletedAt: string | null;
  };
}

export interface AccountModel {
  username: string;
  nickname: string | null;
  displayName: string;
  gender: "female" | "male" | null;
  planCode: PlanCode;
  effectivePlanCode: PlanCode;
  uiLocale: UiLocale;
  lastLoginAt: string | null;
  lastLearningAt: string | null;
}

export interface ReviewProgressModel {
  completedBatches: number;
  totalBatches: number;
  successfulBatches: number;
  unsuccessfulBatches: number;
}

export interface DateRangeModel {
  startDate: string;
  endDate: string;
  timezone: string;
}

export interface ReviewBatchProjectionModel {
  batchId: string;
  savedAt: string;
  scenario: Scenario;
}

export interface ReviewSummaryModel {
  totalBatches: number;
  successfulBatches: number;
  unsuccessfulBatches: number;
  skippedBatches: number;
}

export interface ActiveRangeModel {
  sessionId: string;
  dateRange: DateRangeModel;
  progress: ReviewProgressModel;
}

export type ReviewSessionModel =
  | {
      sessionId: string;
      mode: "range" | "single_batch";
      status: "active";
      dateRange: DateRangeModel | null;
      progress: ReviewProgressModel;
      currentBatch: ReviewBatchProjectionModel;
      summary: null;
    }
  | {
      sessionId: string;
      mode: "range" | "single_batch";
      status: "completed";
      dateRange: DateRangeModel | null;
      progress: ReviewProgressModel;
      currentBatch: null;
      summary: ReviewSummaryModel;
    };

export interface ReviewSessionCreatedModel {
  session: Extract<ReviewSessionModel, { status: "active" }>;
  reused: boolean;
}

export interface ReviewRangePreviewModel {
  batchCount: number;
  entryCount: number;
  empty: boolean;
}

export type SafeHintSegmentModel =
  { kind: "text"; text: string } | { kind: "blank"; lengthHint: number };

declare const clozeGroupRefBrand: unique symbol;
export type ClozeGroupRef = string & {
  readonly [clozeGroupRefBrand]: "ClozeGroupRef";
};

export type SafePassageSegmentModel =
  | { kind: "text"; text: string }
  | { kind: "blank"; blankId: string; groupRef: ClozeGroupRef };

export type ReviewItemModel =
  | {
      stage: "spelling";
      itemId: string;
      entryMeaning: string;
      hintSegments: SafeHintSegmentModel[];
    }
  | {
      stage: "passage_cloze";
      itemId: string;
      passageSegments: SafePassageSegmentModel[];
    };

export interface ReviewItemProgressModel {
  stage: "spelling" | "passage_cloze";
  itemNumber: number;
  itemsInStage: number;
}

export interface ReviewAttemptModel {
  attemptId: string;
  item: ReviewItemModel;
  progress: ReviewItemProgressModel;
}

export type ReviewAnswerModel =
  | { actionId: string; itemId: string; action: "skip" }
  | { actionId: string; itemId: string; action: "answer"; answer: string }
  | {
      actionId: string;
      itemId: string;
      action: "answer";
      answers: Array<{ blankId: string; answer: string }>;
    };

export interface ReviewBatchResultModel {
  batchId: string;
  successful: boolean;
  errorCount: number;
  skipCount: number;
}

export type ReviewActionOutcomeModel =
  | {
      outcome: "retry";
      item: ReviewItemModel;
      progress: ReviewItemProgressModel;
      incorrectBlankIds: string[] | null;
    }
  | {
      outcome: "advanced";
      result: "correct" | "skipped";
      item: ReviewItemModel;
      progress: ReviewItemProgressModel;
    }
  | {
      outcome: "batch_completed";
      batchResult: ReviewBatchResultModel;
      sessionProgress: ReviewProgressModel;
      nextBatch: ReviewBatchProjectionModel;
    }
  | {
      outcome: "session_completed";
      batchResult: ReviewBatchResultModel;
      sessionProgress: ReviewProgressModel;
      sessionSummary: ReviewSummaryModel;
    };

export type ModelProtocol =
  "openai_chat" | "openai_responses" | "anthropic_messages";
export interface ModelConnectionModel {
  id: string;
  name: string;
  protocol: ModelProtocol;
  baseUrl: string;
  credentialConfigured: boolean;
  maskedHint: string | null;
}
export interface ModelConfigurationInput {
  displayName: string;
  description: string | null;
  providerModelId: string;
  connectionId: string | null;
  connection: {
    name: string;
    protocol: ModelProtocol;
    baseUrl: string;
    apiKey: string;
  } | null;
  maxOutputTokens: number | null;
  outputMode: "prompt" | "json_schema";
  enabled: boolean;
  expectedRevision: string;
}

export type NewModelConfiguration = Pick<
  ModelConfigurationInput,
  | "displayName"
  | "description"
  | "providerModelId"
  | "maxOutputTokens"
  | "outputMode"
  | "enabled"
>;
export interface ModelBatchConfigurationInput {
  connectionId: string | null;
  connection: ModelConfigurationInput["connection"];
  expectedRevision: string;
  models: NewModelConfiguration[];
}

export interface AdminProviderModel {
  connection: ModelConnectionModel;
  models: AdminModelModel[];
}
export interface ProviderConfigurationInput {
  connection: NonNullable<ModelConfigurationInput["connection"]>;
  models: Array<NewModelConfiguration & { id: string | null }>;
  expectedRevision: string;
}

export interface AdminModelModel {
  revision: string;
  retiredAt: string | null;
  id: string;
  displayName: string;
  description: string | null;
  providerModelId: string;
  connection: ModelConnectionModel;
  maxOutputTokens: number | null;
  outputMode: "prompt" | "json_schema";
  enabled: boolean;
  assignedGroupCodes: GroupCode[];
  createdAt: string;
  updatedAt: string;
}

export interface GroupPolicyModel {
  revision: string;
  priority: number;
  code: GroupCode;
  rolling24hLimit: number | null;
  maxEntries: number;
  allowedLengths: PassageLength[];
  models: Array<{ id: string; displayName: string; enabled: boolean }>;
}

export interface AdminUserSummaryModel {
  id: string;
  username: string;
  role: ActorRole;
  planCode: PlanCode | null;
  status: "active";
  createdAt: string;
}

export type AdminGenerationQuotaModel =
  | { kind: "limited"; remaining: number }
  | { kind: "unlimited" }
  | { kind: "not_applicable" };

export interface AdminUserDetailModel extends AdminUserSummaryModel {
  nickname: string | null;
  gender: "male" | "female" | null;
  lastLoginAt: string | null;
  lastLearningAt: string | null;
  baseRevision: string | null;
  effectivePlanCode: PlanCode | null;
  growth: {
    levelNumber: number;
    points: string;
    experience: string;
    masteredTotal: number;
    savedTotal: number;
  } | null;
  uiLocale: UiLocale | null;
  learningBatchCount: number;
  generationQuota: AdminGenerationQuotaModel;
}

export interface UserGroupChangeModel {
  user: AdminUserDetailModel;
  quotaReset: true;
}

export function initialGenerationState(): GenerationStateModel {
  return {
    phase: "idle",
    runId: null,
    streamedText: "",
    result: null,
    failure: null,
  };
}
