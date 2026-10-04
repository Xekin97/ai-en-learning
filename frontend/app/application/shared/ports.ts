import type { AdminPresetsPort } from "@application/admin/presets";
import type { AdminItemsPort } from "@application/admin/items";
import type { AdminGrowthPort } from "@application/admin/growth";
import type { AnalyticsPort } from "@application/analytics/models";
import type { AdminNoticesPort } from "@application/admin/notices";
import type { AdminUserBenefitsPort } from "@application/admin/user-benefits";
import type {
  AdminConfigurationPort,
  GroupDraft,
} from "@application/admin/configuration";
import type { BenefitsPort } from "@application/benefits/models";
import type { GrowthPort } from "@application/growth/models";
import type { ReviewPort } from "@application/review/models";
import type { PresetsPort } from "@application/presets/models";
import type { NoticesPort } from "@application/notices/models";
import type {
  AccountModel,
  AdminModelModel,
  AdminUserDetailModel,
  AdminUserSummaryModel,
  AuthSessionResult,
  BatchDetailModel,
  BatchSummaryModel,
  ModelConnectionModel,
  ModelConfigurationInput,
  ModelBatchConfigurationInput,
  AdminProviderModel,
  ProviderConfigurationInput,
  GenerationEventModel,
  GenerationRequestModel,
  GenerationOptionsModel,
  GroupCode,
  GroupPolicyModel,
  LearningSummaryModel,
  PageModel,
  SavedBatchResult,
  SessionSnapshot,
  UiLocale,
  UserGroupChangeModel,
  VisitorClaimLease,
  VocabularyResultModel,
} from "./models";

export interface ApiPort
  extends
    AdminPresetsPort,
    AdminItemsPort,
    AdminGrowthPort,
    AnalyticsPort,
    AdminNoticesPort,
    AdminUserBenefitsPort,
    AdminConfigurationPort,
    NoticesPort,
    PresetsPort,
    ReviewPort,
    GrowthPort,
    BenefitsPort {
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
  updateAccount(input: {
    nickname: string | null;
    gender: "female" | "male" | null;
  }): Promise<AccountModel>;
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
  randomEntry(entries: string[]): Promise<{
    entry: string | null;
    reason: "limit_reached" | "no_candidates" | null;
  }>;
  getGenerationOptions(): Promise<GenerationOptionsModel>;
  streamGeneration(
    input: GenerationRequestModel,
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
  updateBatchTitle(
    batchId: string,
    input: { title: string; expectedTitleRevision: string },
  ): Promise<{ batchId: string; title: string; titleRevision: string }>;
  deleteBatch(batchId: string): Promise<void>;

  listModelProviders(): Promise<{
    items: AdminProviderModel[];
    revision: string;
  }>;
  saveModelProvider(
    providerId: string | null,
    input: ProviderConfigurationInput,
  ): Promise<{ provider: AdminProviderModel; revision: string }>;
  listModelConnections(): Promise<ModelConnectionModel[]>;
  testModelConnection(input: ModelConfigurationInput): Promise<void>;
  listModels(
    cursor?: string,
  ): Promise<PageModel<AdminModelModel> & { revision: string }>;
  createModel(input: ModelConfigurationInput): Promise<AdminModelModel>;
  createModels(
    input: ModelBatchConfigurationInput,
  ): Promise<{ items: AdminModelModel[]; revision: string }>;
  updateModel(
    modelId: string,
    input: ModelConfigurationInput,
    expectedRevision: string,
  ): Promise<AdminModelModel>;
  setModelEnabled(
    modelId: string,
    enabled: boolean,
    expectedRevision: string,
  ): Promise<AdminModelModel>;
  listGroups(): Promise<GroupPolicyModel[]>;
  putGroup(code: GroupCode, input: GroupDraft): Promise<GroupPolicyModel>;
  listUsers(input?: {
    username?: string;
    cursor?: string;
  }): Promise<PageModel<AdminUserSummaryModel>>;
  getUser(userId: string, signal?: AbortSignal): Promise<AdminUserDetailModel>;
  changeUserGroup(
    userId: string,
    groupCode: Exclude<GroupCode, "visitor">,
    expectedBaseRevision: string,
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
