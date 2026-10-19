export type ConfigPortabilityCategory = "models" | "plans" | "items" | "growth";
export type ConfigPortabilityKind =
  | "connection"
  | "model"
  | "plan"
  | "item"
  | "checkin"
  | "mastery"
  | "level"
  | "achievement";

export interface PortabilityCounts {
  added: number;
  updated: number;
  removed: number;
  unchanged: number;
}

export interface PortabilityFieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

export interface PortabilityChange {
  action: "added" | "updated" | "removed" | "unchanged";
  kind: ConfigPortabilityKind;
  identity: string;
  label: string;
  fields: PortabilityFieldChange[];
  credentialAction: "replace_from_package" | "none" | null;
}

export interface PortabilityBlocker {
  code:
    | "missing_reference"
    | "active_reference"
    | "ever_issued"
    | "identity_conflict"
    | "reward_unavailable";
  sourceCategory: "plans" | "presets" | "items" | "growth" | "target_history";
  sourceKind: string;
  sourceIdentity: string | null;
  sourceLabel: string;
  target: { kind: string; identity: string; label: string };
  field: string;
}

export interface PortabilityNotice {
  code: string;
  itemRef: { kind: ConfigPortabilityKind; identity: string } | null;
  field: string | null;
}

export interface PortabilityEffects {
  baseUsers: number;
  activeTrialUsers: number;
  modelCardInstances: number;
  achievedAwards: number;
  claimedAwards: number;
  mayChangeEffectivePlan: boolean;
  mayDowngrade: boolean;
  usageReset: false;
  trialDatesChanged: false;
  historyPreserved: true;
  inFlightPolicy: "accepted_snapshot";
  checkinSource: "pending" | "current" | null;
  targetLearningDay: string | null;
  checkinEffectiveDay: string | null;
  masteryApplies: "new_events" | null;
}

export interface PortabilityPreview {
  category: ConfigPortabilityCategory;
  schemaVersion: number;
  canCommit: boolean;
  operationId: string | null;
  previewToken: string | null;
  baselineRevision: string;
  createdAt: string;
  commitNotAfter: string | null;
  retainUntil: string | null;
  counts: PortabilityCounts;
  changes: PortabilityChange[];
  blockers: PortabilityBlocker[];
  effects: PortabilityEffects;
  warnings: PortabilityNotice[];
  defaultsApplied: PortabilityNotice[];
}

export interface PortabilityResult {
  operationId: string;
  category: ConfigPortabilityCategory;
  status: "applied" | "not_applied";
  reasonCode:
    | "preview_expired"
    | "revision_changed"
    | "impact_changed"
    | "dependency_changed"
    | "resolved_before_commit"
    | "transaction_rolled_back"
    | null;
  baselineRevision: string;
  resultRevision: string;
  currentRevision: string;
  superseded: boolean;
  counts: PortabilityCounts;
  effectiveDay: string | null;
  resolvedAt: string;
  commitNotAfter: string;
  retainUntil: string;
}

export type SafeConfiguration =
  | { category: "models"; connections: SafeConnection[] }
  | { category: "plans"; plans: SafePlan[] }
  | { category: "items"; items: SafeItem[] }
  | {
      category: "growth";
      masteryExperience: string;
      checkin: SafeCheckin;
      levels: SafeLevel[];
      achievements: Record<string, SafeAchievement[]>;
    };

export interface SafeCurrentConfiguration {
  category: ConfigPortabilityCategory;
  revision: string;
  readAt: string;
  configuration: SafeConfiguration;
}

export interface SafeConnection {
  id: string;
  protocol: "openai_chat" | "openai_responses" | "anthropic_messages";
  baseUrl: string;
  name: string | null;
  models: Array<{
    id: string;
    providerModelId: string;
    displayName: string | null;
    description: string | null;
    maxOutputTokens: number | null;
    outputMode: "prompt" | "json_schema";
    enabled: boolean;
    customParameters: Readonly<Record<string, unknown>>;
  }>;
}

export interface SafePlan {
  code: "visitor" | "basic" | "pro" | "plus";
  priority: number;
  rolling24hLimit: number | null;
  maxEntries: number;
  allowedLengths: ("short" | "medium" | "long" | "xlong")[];
  modelIds: string[];
  contentReviewEnabled: boolean;
  contentRepairLimit: number;
}

export interface SafeItem {
  id: string;
  kind: "makeup" | "extra_credit" | "model_trial" | "plan_trial";
  name: { zhCN: string | null; enUS: string | null };
  description: { zhCN: string | null; enUS: string | null };
  exchangePrice: string;
  activationTtlSeconds: number;
  listed: boolean;
  effect: Readonly<Record<string, unknown>>;
}

export interface SafeCheckinValues {
  basePoints: string;
  stepPoints: string;
  capPoints: string;
  normalExperience: string;
}
export interface SafeCheckin {
  current: SafeCheckinValues;
  pending: SafeCheckinValues | null;
}
export interface SafeLevel {
  sourceId: string | null;
  levelNumber: number;
  minExperience: string;
  rewardEnabled: boolean;
  reward: Readonly<Record<string, unknown>>;
}
export interface SafeAchievement {
  id: string;
  kind: string;
  threshold: number;
  enabled: boolean;
  name: { zhCN: string | null; enUS: string | null };
  title: { zhCN: string | null; enUS: string | null };
  description: { zhCN: string | null; enUS: string | null } | null;
  reward: Readonly<Record<string, unknown>>;
}

export interface ExportConfigurationInput {
  category: ConfigPortabilityCategory;
  includeCredentials: boolean;
  passphrase?: string;
  passphraseConfirmation?: string;
  signal?: AbortSignal;
}
export interface PreviewConfigurationInput {
  category: ConfigPortabilityCategory;
  fileBase64: string;
  passphrase?: string;
  signal?: AbortSignal;
}
export interface ImportConfigurationInput extends PreviewConfigurationInput {
  operationId: string;
  previewToken: string;
}

export interface ConfigPortabilityPort {
  exportConfiguration(
    input: ExportConfigurationInput,
  ): Promise<{ blob: Blob; safeFilename: string }>;
  previewConfiguration(
    input: PreviewConfigurationInput,
  ): Promise<PortabilityPreview>;
  importConfiguration(
    input: ImportConfigurationInput,
  ): Promise<PortabilityResult>;
  resolveConfigurationOperation(input: {
    category: ConfigPortabilityCategory;
    operationId: string;
    previewToken: string;
    signal?: AbortSignal;
  }): Promise<PortabilityResult>;
  getCurrentConfiguration(
    category: ConfigPortabilityCategory,
    signal?: AbortSignal,
  ): Promise<SafeCurrentConfiguration>;
}

export interface PortabilityFailure {
  kind: "portability_failure";
  code: string;
  status: number;
  requestId: string;
  fieldIssues: Array<{ field: string; code: string }>;
  items: Array<{
    identity: string | null;
    label: string | null;
    field: string | null;
    code: string;
  }>;
  errorsTruncated: boolean;
  outcome: "unknown" | null;
  retryAfterSeconds: number | null;
}

export const isPortabilityFailure = (
  value: unknown,
): value is PortabilityFailure =>
  !!value &&
  typeof value === "object" &&
  (value as { kind?: unknown }).kind === "portability_failure";

export function validPortabilityPassphrase(value: string): boolean {
  if (value.includes("\u0000") || value.trim().length === 0) return false;
  const points = Array.from(value);
  if (points.length < 12 || points.length > 128) return false;
  if (
    points.some((point) => point.length === 1 && /[\uD800-\uDFFF]/u.test(point))
  )
    return false;
  return new TextEncoder().encode(value).byteLength <= 512;
}
