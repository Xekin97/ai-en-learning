import type {
  PortabilityCurrentDto,
  PortabilityPreviewDto,
  PortabilityResultDto,
} from "../schemas/config-portability";
import type {
  PortabilityChange,
  PortabilityCounts,
  PortabilityNotice,
  PortabilityPreview,
  PortabilityResult,
  SafeAchievement,
  SafeConfiguration,
  SafeCurrentConfiguration,
} from "@application/admin/config-portability";

const mapCounts = (
  value: PortabilityPreviewDto["counts"],
): PortabilityCounts => ({ ...value });
const mapNotice = (
  value: PortabilityPreviewDto["warnings"][number],
): PortabilityNotice => ({
  code: value.code,
  itemRef: value.item_ref
    ? { kind: value.item_ref.kind, identity: value.item_ref.identity }
    : null,
  field: value.field,
});
const mapChange = (
  value: PortabilityPreviewDto["changes"][number],
): PortabilityChange => ({
  action: value.action,
  kind: value.kind,
  identity: value.identity,
  label: value.label,
  fields: value.fields.map((field) => ({
    field: field.field,
    before: structuredClone(field.before),
    after: structuredClone(field.after),
  })),
  credentialAction: value.credential_action,
});

export function mapPortabilityPreview(
  dto: PortabilityPreviewDto,
): PortabilityPreview {
  return {
    category: dto.category,
    schemaVersion: dto.schema_version,
    canCommit: dto.can_commit,
    operationId: dto.operation_id,
    previewToken: dto.preview_token,
    baselineRevision: dto.baseline_revision,
    createdAt: dto.created_at,
    commitNotAfter: dto.commit_not_after,
    retainUntil: dto.retain_until,
    counts: mapCounts(dto.counts),
    changes: dto.changes.map(mapChange),
    blockers: dto.blockers.map((item) => ({
      code: item.code,
      sourceCategory: item.source_category,
      sourceKind: item.source_kind,
      sourceIdentity: item.source_identity,
      sourceLabel: item.source_label,
      target: { ...item.target },
      field: item.field,
    })),
    effects: {
      baseUsers: dto.effects.base_users,
      activeTrialUsers: dto.effects.active_trial_users,
      modelCardInstances: dto.effects.model_card_instances,
      achievedAwards: dto.effects.achieved_awards,
      claimedAwards: dto.effects.claimed_awards,
      mayChangeEffectivePlan: dto.effects.may_change_effective_plan,
      mayDowngrade: dto.effects.may_downgrade,
      usageReset: dto.effects.usage_reset,
      trialDatesChanged: dto.effects.trial_dates_changed,
      historyPreserved: dto.effects.history_preserved,
      inFlightPolicy: dto.effects.in_flight_policy,
      checkinSource: dto.effects.checkin_source,
      targetLearningDay: dto.effects.target_learning_day,
      checkinEffectiveDay: dto.effects.checkin_effective_day,
      masteryApplies: dto.effects.mastery_applies,
    },
    warnings: dto.warnings.map(mapNotice),
    defaultsApplied: dto.defaults_applied.map(mapNotice),
  };
}

export function mapPortabilityResult(
  dto: PortabilityResultDto,
): PortabilityResult {
  return {
    operationId: dto.operation_id,
    category: dto.category,
    status: dto.status,
    reasonCode: dto.reason_code,
    baselineRevision: dto.baseline_revision,
    resultRevision: dto.result_revision,
    currentRevision: dto.current_revision,
    superseded: dto.superseded,
    counts: mapCounts(dto.counts),
    effectiveDay: dto.effective_day,
    resolvedAt: dto.resolved_at,
    commitNotAfter: dto.commit_not_after,
    retainUntil: dto.retain_until,
  };
}

const bilingual = (value: {
  zh_CN?: string | null | undefined;
  en_US?: string | null | undefined;
}) => ({
  zhCN: value.zh_CN ?? null,
  enUS: value.en_US ?? null,
});
const reward = (value: Record<string, unknown>) => structuredClone(value);

export function mapPortabilityCurrent(
  dto: PortabilityCurrentDto,
): SafeCurrentConfiguration {
  const data = dto.configuration;
  let configuration: SafeConfiguration;
  if ("connections" in data) {
    configuration = {
      category: "models",
      connections: data.connections.map((connection) => ({
        id: connection.id,
        protocol: connection.protocol,
        baseUrl: connection.base_url,
        name: connection.name ?? null,
        models: connection.models.map((model) => ({
          id: model.id,
          providerModelId: model.provider_model_id,
          displayName: model.display_name ?? null,
          description: model.description ?? null,
          maxOutputTokens: model.max_output_tokens ?? null,
          outputMode: model.output_mode,
          enabled: model.enabled,
          customParameters: structuredClone(model.custom_parameters),
        })),
      })),
    };
  } else if ("plans" in data) {
    configuration = {
      category: "plans",
      plans: data.plans.map((plan) => ({
        code: plan.code,
        priority: plan.priority,
        rolling24hLimit: plan.rolling_24h_limit,
        maxEntries: plan.max_entries,
        allowedLengths: [...plan.allowed_lengths],
        modelIds: [...plan.model_ids],
        contentReviewEnabled: plan.content_review_enabled,
        contentRepairLimit: plan.content_repair_limit,
      })),
    };
  } else if ("items" in data) {
    configuration = {
      category: "items",
      items: data.items.map((item) => ({
        id: item.id,
        kind: item.kind,
        name: bilingual(item.name),
        description: bilingual(item.description),
        exchangePrice: item.exchange_price,
        activationTtlSeconds: item.activation_ttl_seconds,
        listed: item.listed,
        effect: structuredClone(item.effect),
      })),
    };
  } else {
    const mapAchievement = (
      item: (typeof data.achievements.checkin_streak)[number],
    ): SafeAchievement => ({
      id: item.id,
      kind: item.kind,
      threshold: item.threshold,
      enabled: item.enabled,
      name: bilingual(item.name),
      title: bilingual(item.title),
      description: item.description ? bilingual(item.description) : null,
      reward: reward(item.reward),
    });
    configuration = {
      category: "growth",
      masteryExperience: data.mastery_experience,
      checkin: {
        current: {
          basePoints: data.checkin.current.base_points,
          stepPoints: data.checkin.current.step_points,
          capPoints: data.checkin.current.cap_points,
          normalExperience: data.checkin.current.normal_experience,
        },
        pending: data.checkin.pending
          ? {
              basePoints: data.checkin.pending.base_points,
              stepPoints: data.checkin.pending.step_points,
              capPoints: data.checkin.pending.cap_points,
              normalExperience: data.checkin.pending.normal_experience,
            }
          : null,
      },
      levels: data.levels.map((level) => ({
        sourceId: level.source_id ?? null,
        levelNumber: level.level_number,
        minExperience: level.min_experience,
        rewardEnabled: level.reward_enabled,
        reward: reward(level.reward),
      })),
      achievements: Object.fromEntries(
        Object.entries(data.achievements).map(([kind, items]) => [
          kind,
          items.map(mapAchievement),
        ]),
      ),
    };
  }
  if (configuration.category !== dto.category)
    throw new Error("Configuration category mismatch");
  return {
    category: dto.category,
    revision: dto.revision,
    readAt: dto.read_at,
    configuration,
  };
}
