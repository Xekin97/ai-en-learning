import { z } from "zod";
import {
  dateSchema,
  nonEmptyStringSchema as str,
  rfc3339Schema,
  successEnvelopeSchema,
} from "./common";
import { amountSchema, achievementKindSchema, itemKindSchema } from "./growth";
import { customParametersSchema } from "./admin";

export const portabilityCategorySchema = z.enum([
  "models",
  "plans",
  "items",
  "growth",
]);
export const portabilityKindSchema = z.enum([
  "connection",
  "model",
  "plan",
  "item",
  "checkin",
  "mastery",
  "level",
  "achievement",
]);
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const uuid = z.uuid();
const counts = z.strictObject({
  added: count,
  updated: count,
  removed: count,
  unchanged: count,
});
const jsonValue: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number().finite(),
    z.boolean(),
    z.null(),
    z.array(jsonValue),
    z.record(z.string(), jsonValue),
  ]),
);

const fieldChange = z.strictObject({
  field: z.string().regex(/^\/(?:[^~/]|~0|~1)+(?:\/(?:[^~/]|~0|~1)+)*$/),
  before: jsonValue,
  after: jsonValue,
});
export const portabilityChangeSchema = z
  .strictObject({
    action: z.enum(["added", "updated", "removed", "unchanged"]),
    kind: portabilityKindSchema,
    identity: str,
    label: z.string(),
    fields: z.array(fieldChange),
    credential_action: z.enum(["replace_from_package", "none"]).nullable(),
  })
  .superRefine((value, context) => {
    if ((value.kind === "connection") !== (value.credential_action !== null))
      context.addIssue({
        code: "custom",
        message: "credential_action does not match change kind",
      });
    if (
      value.fields.some((field) => /(?:^|\/)api_key(?:\/|$)/.test(field.field))
    )
      context.addIssue({ code: "custom", message: "secret field in change" });
  });

const blocker = z
  .strictObject({
    code: z.enum([
      "missing_reference",
      "active_reference",
      "ever_issued",
      "identity_conflict",
      "reward_unavailable",
    ]),
    source_category: z.enum([
      "plans",
      "presets",
      "items",
      "growth",
      "target_history",
    ]),
    source_kind: str,
    source_identity: str.nullable(),
    source_label: z.string(),
    target: z.strictObject({ kind: str, identity: str, label: z.string() }),
    field: z.string(),
  })
  .superRefine((value, context) => {
    if (
      (value.source_category === "target_history") !==
      (value.source_identity === null)
    )
      context.addIssue({
        code: "custom",
        message: "target_history identity mismatch",
      });
  });

const identityFor = (
  kind: z.infer<typeof portabilityKindSchema>,
  identity: string,
) => {
  if (["connection", "model", "item", "achievement"].includes(kind))
    return z.uuid().safeParse(identity).success;
  if (kind === "plan")
    return ["visitor", "basic", "pro", "plus"].includes(identity);
  if (kind === "checkin") return identity === "current-intent";
  if (kind === "mastery") return identity === "mastery";
  return (
    /^level:[1-9]\d{0,9}$/.test(identity) &&
    Number(identity.slice(6)) <= 2147483647
  );
};
const notice = z
  .strictObject({
    code: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
    item_ref: z
      .strictObject({ kind: portabilityKindSchema, identity: str })
      .nullable(),
    field: z
      .string()
      .regex(/^\/(?:[^~/]|~0|~1)+(?:\/(?:[^~/]|~0|~1)+)*$/)
      .nullable(),
  })
  .superRefine((value, context) => {
    if (
      value.item_ref &&
      !identityFor(value.item_ref.kind, value.item_ref.identity)
    )
      context.addIssue({ code: "custom", message: "invalid notice identity" });
    if (!value.item_ref && value.field !== null)
      context.addIssue({
        code: "custom",
        message: "category notice cannot have field",
      });
    if (
      value.field &&
      (value.field.includes("api_key") ||
        value.field.startsWith("/custom_parameters/"))
    )
      context.addIssue({ code: "custom", message: "unsafe notice field" });
  });
const effects = z.strictObject({
  base_users: count,
  active_trial_users: count,
  model_card_instances: count,
  achieved_awards: count,
  claimed_awards: count,
  may_change_effective_plan: z.boolean(),
  may_downgrade: z.boolean(),
  usage_reset: z.literal(false),
  trial_dates_changed: z.literal(false),
  history_preserved: z.literal(true),
  in_flight_policy: z.literal("accepted_snapshot"),
  checkin_source: z.enum(["pending", "current"]).nullable(),
  target_learning_day: dateSchema.nullable(),
  checkin_effective_day: dateSchema.nullable(),
  mastery_applies: z.literal("new_events").nullable(),
});

export const portabilityPreviewSchema = z
  .strictObject({
    category: portabilityCategorySchema,
    schema_version: z.number().int().positive(),
    can_commit: z.boolean(),
    operation_id: uuid.nullable(),
    preview_token: str.nullable(),
    baseline_revision: str,
    created_at: rfc3339Schema,
    commit_not_after: rfc3339Schema.nullable(),
    retain_until: rfc3339Schema.nullable(),
    counts,
    changes: z.array(portabilityChangeSchema),
    blockers: z.array(blocker),
    effects,
    warnings: z.array(notice),
    defaults_applied: z.array(notice),
  })
  .superRefine((value, context) => {
    const ticket =
      value.operation_id !== null &&
      value.preview_token !== null &&
      value.commit_not_after !== null &&
      value.retain_until !== null;
    if (
      value.can_commit !== ticket ||
      (value.can_commit ? value.blockers.length !== 0 : ticket)
    )
      context.addIssue({
        code: "custom",
        message: "preview ticket relationship invalid",
      });
    if (value.commit_not_after && value.retain_until) {
      const commit = Date.parse(value.commit_not_after),
        retain = Date.parse(value.retain_until);
      if (
        commit - Date.parse(value.created_at) !== 300_000 ||
        retain - commit !== 86_400_000
      )
        context.addIssue({
          code: "custom",
          message: "preview time window invalid",
        });
    }
    const refs = new Set(
      value.changes.map((change) => `${change.kind}:${change.identity}`),
    );
    for (const item of [...value.warnings, ...value.defaults_applied]) {
      if (
        item.item_ref &&
        !refs.has(`${item.item_ref.kind}:${item.item_ref.identity}`)
      )
        context.addIssue({
          code: "custom",
          message: "notice does not match change",
        });
    }
    for (const item of value.defaults_applied)
      if (!item.item_ref || item.field === null)
        context.addIssue({
          code: "custom",
          message: "default notice lacks locator",
        });
  });

const reason = z.enum([
  "preview_expired",
  "revision_changed",
  "impact_changed",
  "dependency_changed",
  "resolved_before_commit",
  "transaction_rolled_back",
]);
export const portabilityResultSchema = z
  .strictObject({
    operation_id: uuid,
    category: portabilityCategorySchema,
    status: z.enum(["applied", "not_applied"]),
    reason_code: reason.nullable(),
    baseline_revision: str,
    result_revision: str,
    current_revision: str,
    superseded: z.boolean(),
    counts,
    effective_day: dateSchema.nullable(),
    resolved_at: rfc3339Schema,
    commit_not_after: rfc3339Schema,
    retain_until: rfc3339Schema,
  })
  .superRefine((value, context) => {
    const zero = Object.values(value.counts).every((item) => item === 0);
    if (value.status === "applied") {
      if (
        value.reason_code !== null ||
        value.superseded !== (value.current_revision !== value.result_revision)
      )
        context.addIssue({
          code: "custom",
          message: "applied result relationship invalid",
        });
    } else if (
      value.reason_code === null ||
      !zero ||
      value.effective_day !== null ||
      value.superseded ||
      value.baseline_revision !== value.result_revision
    )
      context.addIssue({
        code: "custom",
        message: "not-applied result relationship invalid",
      });
    if (
      Date.parse(value.retain_until) - Date.parse(value.commit_not_after) !==
      86_400_000
    )
      context.addIssue({
        code: "custom",
        message: "result retention window invalid",
      });
  });

const bilingual = z.strictObject({
  zh_CN: z.string().nullable().optional(),
  en_US: z.string().nullable().optional(),
});
const model = z.strictObject({
  id: uuid,
  provider_model_id: str,
  display_name: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  max_output_tokens: z
    .number()
    .int()
    .positive()
    .max(1048576)
    .nullable()
    .optional(),
  output_mode: z.enum(["prompt", "json_schema"]),
  enabled: z.boolean(),
  custom_parameters: customParametersSchema,
});
const connection = z.strictObject({
  id: uuid,
  protocol: z.enum(["openai_chat", "openai_responses", "anthropic_messages"]),
  base_url: str,
  name: z.string().nullable().optional(),
  models: z.array(model),
});
const plan = z.strictObject({
  code: z.enum(["visitor", "basic", "pro", "plus"]),
  priority: count,
  rolling_24h_limit: count.nullable(),
  max_entries: z.number().int().positive(),
  allowed_lengths: z.array(z.enum(["short", "medium", "long", "xlong"])),
  model_ids: z.array(uuid),
  content_review_enabled: z.boolean(),
  content_repair_limit: count.max(99),
});
const rewardBase = {
  points: amountSchema,
  item_definition_id: uuid.nullable().optional(),
  item_count: count.max(2147483647).optional(),
};
const itemEffect = z.strictObject({
  kind: itemKindSchema,
  extra_count: z.number().int().positive().optional(),
  model_ids: z.array(uuid).optional(),
  trial_seconds: z.number().int().positive().optional(),
  retirement_points: amountSchema.optional(),
  target_plan_code: z.enum(["basic", "pro", "plus"]).optional(),
});
const item = z.strictObject({
  id: uuid,
  kind: itemKindSchema,
  name: bilingual,
  description: bilingual,
  exchange_price: amountSchema,
  activation_ttl_seconds: z.number().int().positive(),
  listed: z.boolean(),
  effect: itemEffect,
});
const checkinValues = z.strictObject({
  base_points: amountSchema,
  step_points: amountSchema,
  cap_points: amountSchema,
  normal_experience: amountSchema,
});
const level = z.strictObject({
  source_id: uuid.nullable().optional(),
  level_number: z.number().int().positive().max(2147483647),
  min_experience: amountSchema,
  reward_enabled: z.boolean(),
  reward: z.strictObject(rewardBase),
});
const achievement = z.strictObject({
  id: uuid,
  kind: achievementKindSchema,
  threshold: z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  enabled: z.boolean(),
  name: bilingual,
  title: bilingual,
  description: bilingual.nullable().optional(),
  reward: z.strictObject({ ...rewardBase, experience: amountSchema }),
});
const modelsData = z.strictObject({ connections: z.array(connection) });
const plansData = z.strictObject({ plans: z.array(plan).length(4) });
const itemsData = z.strictObject({ items: z.array(item) });
const growthData = z.strictObject({
  mastery_experience: amountSchema,
  checkin: z.strictObject({
    current: checkinValues,
    pending: checkinValues.nullable().optional(),
  }),
  levels: z.array(level).min(1),
  achievements: z.strictObject({
    checkin_streak: z.array(achievement),
    review_streak: z.array(achievement),
    mastered_words: z.array(achievement),
    saved_passages: z.array(achievement),
  }),
});

export const safeConfigurationDataSchema = z.union([
  modelsData,
  plansData,
  itemsData,
  growthData,
]);
export const portabilityCurrentSchema = z
  .strictObject({
    category: portabilityCategorySchema,
    revision: str,
    read_at: rfc3339Schema,
    configuration: safeConfigurationDataSchema,
  })
  .superRefine((value, context) => {
    const keys = Object.keys(value.configuration);
    const expected = {
      models: "connections",
      plans: "plans",
      items: "items",
      growth: "mastery_experience",
    }[value.category];
    if (!keys.includes(expected))
      context.addIssue({
        code: "custom",
        message: "current category/configuration mismatch",
      });
  });

export const portabilityPreviewEnvelopeSchema = successEnvelopeSchema(
  portabilityPreviewSchema,
);
export const portabilityResultEnvelopeSchema = successEnvelopeSchema(
  portabilityResultSchema,
);
export const portabilityCurrentEnvelopeSchema = successEnvelopeSchema(
  portabilityCurrentSchema,
);
export type PortabilityPreviewDto = z.infer<typeof portabilityPreviewSchema>;
export type PortabilityResultDto = z.infer<typeof portabilityResultSchema>;
export type PortabilityCurrentDto = z.infer<typeof portabilityCurrentSchema>;
