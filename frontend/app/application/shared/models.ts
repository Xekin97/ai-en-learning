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
  retryAfterSeconds?: number;
  accepted?: false;
}

export type ContentServiceModel =
  | {
      nativeValidation: true;
      contentReviewEnabled: false;
      contentRepairLimit: 0;
    }
  | {
      nativeValidation: true;
      contentReviewEnabled: true;
      contentRepairLimit: number;
    };
export interface NativePolicyModel {
  version: "m003-native-policy-v1";
  scope: "logical_request";
  maxCalls: 2;
  editable: false;
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
  configurationRevision: string;
  contentService: ContentServiceModel;
  nativeCorrectionPolicy: NativePolicyModel;
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

export type ContentOutcomeModel =
  | "basic"
  | "review_passed"
  | "repaired_passed"
  | "limit_finalized"
  | "service_incomplete";
export type CompletionNoticeModel = "content_review_incomplete" | null;
export type PlanPreviewItemModel =
  | { kind: "scene"; text: string }
  | {
      kind: "word_use";
      entry: string;
      form: string;
      sense: string;
      phrase: string;
    };

export type ContentActivityModel = "writing" | "improving";
export type ContentDraftModeModel =
  "initial" | "replace" | "append" | "restore";
export type ContentDraftEventModel =
  | {
      kind: "draft";
      seq: number;
      action: "begin";
      draftId: string;
      contentVersion: number;
      baseRev: number;
      mode: ContentDraftModeModel;
    }
  | {
      kind: "draft";
      seq: number;
      action: "paragraph_complete";
      draftId: string;
      contentVersion: number;
      baseRev: number;
      paragraphIndex: number;
    }
  | {
      kind: "draft";
      seq: number;
      action: "body_complete";
      draftId: string;
      contentVersion: number;
      baseRev: number;
      bodyLength: number;
      paragraphCount: number;
    }
  | {
      kind: "draft";
      seq: number;
      action: "discard";
      draftId: string;
      contentVersion: number;
      baseRev: number;
    };
export interface ContentParagraphModel {
  index: number;
  text: string;
}
export interface ContentDraftStateModel {
  working: string;
  published: string;
  workingCodePointLength: number;
  publishedParagraphs: ContentParagraphModel[];
  draftId: string | null;
  mode: ContentDraftModeModel | null;
  contentVersion: number | null;
  latestProviderVersion: number | null;
  revision: number;
  retiredDraftIds: string[];
  beginParagraphs: string[];
  nextParagraphIndex: number;
  bodyComplete: boolean;
  discarded: boolean;
  everStarted: boolean;
  beginCodePointLength: number;
  committedPrefixCodePoints: number;
  committedPrefixUtf16: number;
  editCursorCodePoints: number;
  editCursorUtf16: number;
  transactionEndCodePoints: number;
  presentationRevision: number;
  presentationIntent:
    "reset" | "initial_append" | "paragraph" | "body" | "discard";
  changedParagraphs: number[];
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
  | {
      kind: "started";
      seq: 1;
      streamId: string;
      runId: string;
      snapshot: {
        configurationRevision: string;
        effectivePlan: {
          code: GroupCode;
          origin: "base" | "trial" | "visitor";
        };
        contentService: ContentServiceModel;
        nativeCorrectionPolicy: NativePolicyModel;
      };
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
      finalContentVersion: number;
      result: GenerationResultModel;
      contentOutcome: ContentOutcomeModel;
      completionNotice: CompletionNoticeModel;
    }
  | {
      kind: "failed";
      seq: number;
      code: string;
      quotaRefunded: boolean;
      retryable: boolean;
      requestId: string;
    }
  | { kind: "cancelled"; seq: number; quotaRefunded: false }
  | {
      kind: "settlement_pending";
      seq: number;
      code: "settlement_unconfirmed";
      requestId: string;
    };

export type GenerationPhase =
  | "idle"
  | "streaming"
  | "pending"
  | "valid"
  | "saved"
  | "discarded"
  | "cancelled"
  | "failed";

export interface GenerationStateModel {
  phase: GenerationPhase;
  runId: string | null;
  streamedText: string;
  draft: ContentDraftStateModel;
  activity: ContentActivityModel | null;
  requestPhase: "accepted" | "planning" | "composing" | "finalizing" | null;
  acceptedContentService: ContentServiceModel | null;
  acceptedSnapshot: GenerationStatusModel["snapshot"] | null;
  lastSeq: number;
  lastFrame: string | null;
  planId: string | null;
  planMeaningLanguage: MeaningLanguage | null;
  planItems: PlanPreviewItemModel[];
  requestedEntries: string[];
  requestedMeaningLanguage: MeaningLanguage | null;
  draftId: string | null;
  retiredDraftIds: string[];
  contentVersion: number | null;
  revision: number;
  codePointLength: number;
  result: GenerationResultModel | null;
  finalContentVersion: number | null;
  contentOutcome: ContentOutcomeModel | null;
  completionNotice: CompletionNoticeModel;
  resultUnavailable: boolean;
  canSave: boolean;
  failure: AppFailure | null;
}

export type GenerationStatusModel = {
  runId: string;
  snapshot: {
    configurationRevision: string;
    effectivePlan: { code: GroupCode; origin: "base" | "trial" | "visitor" };
    contentService: ContentServiceModel;
    nativeCorrectionPolicy: NativePolicyModel;
  };
} & (
  | { status: "active" }
  | {
      status: "valid";
      finalContentVersion: number;
      result: GenerationResultModel | null;
      contentOutcome: ContentOutcomeModel;
      completionNotice: CompletionNoticeModel;
      canSave: boolean;
      quotaRefunded: false;
    }
  | { status: "failed" | "cancelled"; quotaRefunded: boolean }
);

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
export type JsonPrimitive = null | boolean | number | string;
type JsonValueAtDepth8 =
  | JsonPrimitive
  | { readonly [key: string]: JsonPrimitive }
  | readonly JsonPrimitive[];
type JsonValueAtDepth7 =
  | JsonPrimitive
  | { readonly [key: string]: JsonValueAtDepth8 }
  | readonly JsonValueAtDepth8[];
type JsonValueAtDepth6 =
  | JsonPrimitive
  | { readonly [key: string]: JsonValueAtDepth7 }
  | readonly JsonValueAtDepth7[];
type JsonValueAtDepth5 =
  | JsonPrimitive
  | { readonly [key: string]: JsonValueAtDepth6 }
  | readonly JsonValueAtDepth6[];
type JsonValueAtDepth4 =
  | JsonPrimitive
  | { readonly [key: string]: JsonValueAtDepth5 }
  | readonly JsonValueAtDepth5[];
type JsonValueAtDepth3 =
  | JsonPrimitive
  | { readonly [key: string]: JsonValueAtDepth4 }
  | readonly JsonValueAtDepth4[];
export type JsonValue =
  | JsonPrimitive
  | { readonly [key: string]: JsonValueAtDepth3 }
  | readonly JsonValueAtDepth3[];
export type JsonObject = { readonly [key: string]: JsonValue };
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
  customParameters: JsonObject;
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
  | "customParameters"
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
  customParameters: JsonObject;
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
  contentReviewEnabled: boolean;
  contentRepairLimit: number;
  nativeCorrectionPolicy: NativePolicyModel;
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
    draft: initialContentDraftState(),
    activity: null,
    requestPhase: null,
    acceptedContentService: null,
    acceptedSnapshot: null,
    lastSeq: 0,
    lastFrame: null,
    planId: null,
    planMeaningLanguage: null,
    planItems: [],
    requestedEntries: [],
    requestedMeaningLanguage: null,
    draftId: null,
    retiredDraftIds: [],
    contentVersion: null,
    revision: 0,
    codePointLength: 0,
    result: null,
    finalContentVersion: null,
    contentOutcome: null,
    completionNotice: null,
    resultUnavailable: false,
    canSave: false,
    failure: null,
  };
}

export function initialContentDraftState(): ContentDraftStateModel {
  return {
    working: "",
    published: "",
    workingCodePointLength: 0,
    publishedParagraphs: [],
    draftId: null,
    mode: null,
    contentVersion: null,
    latestProviderVersion: null,
    revision: 0,
    retiredDraftIds: [],
    beginParagraphs: [],
    nextParagraphIndex: 0,
    bodyComplete: false,
    discarded: false,
    everStarted: false,
    beginCodePointLength: 0,
    committedPrefixCodePoints: 0,
    committedPrefixUtf16: 0,
    editCursorCodePoints: 0,
    editCursorUtf16: 0,
    transactionEndCodePoints: 0,
    presentationRevision: 0,
    presentationIntent: "reset",
    changedParagraphs: [],
  };
}

export function resetContentDraftState(
  previous?: ContentDraftStateModel,
): ContentDraftStateModel {
  const state = initialContentDraftState();
  if (previous) state.presentationRevision = previous.presentationRevision + 1;
  return state;
}
