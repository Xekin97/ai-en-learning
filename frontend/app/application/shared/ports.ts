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
  GenerationEventModel,
  GenerationInputModel,
  GenerationOptionsModel,
  GroupCode,
  GroupPolicyModel,
  LearningSummaryModel,
  PageModel,
  PassageLength,
  ReviewActionOutcomeModel,
  ReviewAnswerModel,
  ReviewAttemptModel,
  ReviewRangePreviewModel,
  ReviewSessionCreatedModel,
  ReviewSessionModel,
  SavedBatchResult,
  SessionSnapshot,
  UiLocale,
  UserGroupChangeModel,
  VisitorClaimLease,
  VocabularyResultModel,
} from "./models";

export interface ApiPort {
  bootstrap(): Promise<SessionSnapshot>;
  updateLocale(locale: UiLocale): Promise<UiLocale>;
  register(input: {
    username: string;
    password: string;
    passwordConfirmation: string;
    uiLocale: UiLocale;
  }): Promise<AuthSessionResult>;
  login(input: {
    username: string;
    password: string;
    browserUiLocale: UiLocale;
  }): Promise<AuthSessionResult>;
  logout(): Promise<void>;
  getAccount(): Promise<AccountModel>;
  changePassword(input: {
    currentPassword: string;
    newPassword: string;
    confirmation: string;
  }): Promise<void>;
  deleteAccount(input: {
    currentPassword: string;
    confirmed: true;
  }): Promise<void>;

  searchVocabulary(
    query: string,
    signal?: AbortSignal,
  ): Promise<VocabularyResultModel>;
  getGenerationOptions(): Promise<GenerationOptionsModel>;
  streamGeneration(
    input: GenerationInputModel,
    onEvent: (event: GenerationEventModel) => void,
    signal: AbortSignal,
  ): Promise<void>;
  cancelGeneration(runId: string): Promise<"cancelled" | "valid" | "failed">;
  saveGeneration(runId: string): Promise<SavedBatchResult>;
  discardGeneration(runId: string): Promise<void>;
  createVisitorClaim(runId: string): Promise<VisitorClaimLease>;
  consumeVisitorClaim(): Promise<{ batchId: string; claimed: true }>;

  getLearningSummary(): Promise<LearningSummaryModel>;
  listBatches(input?: {
    entry?: string;
    cursor?: string;
  }): Promise<PageModel<BatchSummaryModel>>;
  getBatch(batchId: string): Promise<BatchDetailModel>;
  setBatchParticipation(
    batchId: string,
    participates: boolean,
  ): Promise<boolean>;
  deleteBatch(batchId: string): Promise<void>;

  previewReviewRange(
    input: { startDate: string; endDate: string; timezone: string },
    signal?: AbortSignal,
  ): Promise<ReviewRangePreviewModel>;
  getActiveRange(): Promise<ActiveRangeModel | null>;
  createReviewSession(
    input:
      | { mode: "range"; startDate: string; endDate: string; timezone: string }
      | { mode: "single_batch"; batchId: string },
  ): Promise<ReviewSessionCreatedModel>;
  getReviewSession(sessionId: string): Promise<ReviewSessionModel>;
  startReviewAttempt(sessionId: string): Promise<ReviewAttemptModel>;
  actOnReview(
    attemptId: string,
    input: ReviewAnswerModel,
  ): Promise<ReviewActionOutcomeModel>;

  getCredential(): Promise<CredentialStatusModel>;
  putCredential(apiKey: string): Promise<CredentialStatusModel>;
  listModels(cursor?: string): Promise<PageModel<AdminModelModel>>;
  createModel(input: {
    displayName: string;
    description: string | null;
    openRouterModelId: string;
  }): Promise<AdminModelModel>;
  updateModel(
    modelId: string,
    input: {
      displayName?: string;
      description?: string | null;
      openRouterModelId?: string;
    },
  ): Promise<AdminModelModel>;
  setModelEnabled(modelId: string, enabled: boolean): Promise<AdminModelModel>;
  listGroups(): Promise<GroupPolicyModel[]>;
  putGroup(
    code: GroupCode,
    input: {
      rolling24hLimit: number | null;
      maxEntries: number;
      allowedLengths: PassageLength[];
      modelIds: string[];
    },
  ): Promise<GroupPolicyModel>;
  listUsers(input?: {
    username?: string;
    cursor?: string;
  }): Promise<PageModel<AdminUserSummaryModel>>;
  getUser(userId: string, signal?: AbortSignal): Promise<AdminUserDetailModel>;
  changeUserGroup(
    userId: string,
    groupCode: Exclude<GroupCode, "visitor">,
  ): Promise<UserGroupChangeModel>;
  resetUserPassword(
    userId: string,
    password: string,
    confirmation: string,
  ): Promise<void>;
  listUserBatches(
    userId: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<PageModel<BatchSummaryModel>>;
  getUserBatch(
    userId: string,
    batchId: string,
    signal?: AbortSignal,
  ): Promise<BatchDetailModel>;
  hasVisitorClaim(): boolean;
}
