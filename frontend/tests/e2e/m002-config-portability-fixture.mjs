const operationId = "00000000-0000-4000-8000-000000000101";
const connectionId = "00000000-0000-4000-8000-000000000102";
const modelId = "00000000-0000-4000-8000-000000000103";
const createdAt = "2026-10-16T23:50:00Z";
const commitNotAfter = "2026-10-16T23:55:00Z";
const retainUntil = "2026-10-17T23:55:00Z";
let importMode = "applied";
let importCalls = 0;
const counts = { added: 1, updated: 1, removed: 1, unchanged: 0 };
const zeroCounts = { added: 0, updated: 0, removed: 0, unchanged: 0 };
const effects = {
  base_users: 2,
  active_trial_users: 1,
  model_card_instances: 3,
  achieved_awards: 0,
  claimed_awards: 0,
  may_change_effective_plan: true,
  may_downgrade: false,
  usage_reset: false,
  trial_dates_changed: false,
  history_preserved: true,
  in_flight_policy: "accepted_snapshot",
  checkin_source: null,
  target_learning_day: null,
  checkin_effective_day: null,
  mastery_applies: null,
};
const changes = [
  {
    action: "removed",
    kind: "model",
    identity: modelId,
    label: "Legacy model",
    fields: [{ field: "/enabled", before: false, after: null }],
    credential_action: null,
  },
  {
    action: "added",
    kind: "model",
    identity: "00000000-0000-4000-8000-000000000104",
    label: "New model",
    fields: [{ field: "/max_output_tokens", before: null, after: 0 }],
    credential_action: null,
  },
  {
    action: "updated",
    kind: "connection",
    identity: connectionId,
    label: "Synthetic connection",
    fields: [{ field: "/name", before: "Old", after: "New" }],
    credential_action: "replace_from_package",
  },
];
const result = (status = "applied") => ({
  operation_id: operationId,
  category: "models",
  status,
  reason_code: status === "applied" ? null : "revision_changed",
  baseline_revision: status === "applied" ? "r1" : "r2",
  result_revision: "r2",
  current_revision: "r2",
  superseded: false,
  counts: status === "applied" ? counts : zeroCounts,
  effective_day: null,
  resolved_at: "2026-10-16T23:54:00Z",
  commit_not_after: commitNotAfter,
  retain_until: retainUntil,
});

export async function configPortabilityFixture(request, response, url) {
  const json = (data, status = 200, headers = {}) => {
    response.writeHead(status, {
      "content-type": "application/json",
      ...headers,
    });
    response.end(
      JSON.stringify({ data, meta: { request_id: "portability-fixture" } }),
    );
    return true;
  };
  const problem = (status, code, context = undefined, headers = {}) => {
    response.writeHead(status, {
      "content-type": "application/problem+json",
      ...headers,
    });
    response.end(
      JSON.stringify({
        type: "about:blank",
        title: "Configuration operation",
        status,
        code,
        detail: "Synthetic fixture response",
        request_id: "portability-fixture",
        ...(context ? { context } : {}),
      }),
    );
    return true;
  };
  const body = async () => {
    let raw = "";
    for await (const chunk of request) raw += chunk;
    return raw ? JSON.parse(raw) : {};
  };
  if (url.pathname === "/api/v1/__test/portability-reset") {
    importMode = "applied";
    importCalls = 0;
    return json({});
  }
  if (url.pathname === "/api/v1/__test/portability-mode") {
    const input = await body();
    importMode = input.mode;
    return json({});
  }
  if (url.pathname === "/api/v1/__test/portability-state")
    return json({ import_calls: importCalls, mode: importMode });
  const match = url.pathname.match(
    /^\/api\/v1\/admin\/config-portability\/(models|plans|items|growth)(.*)$/,
  );
  if (!match) return false;
  const category = match[1],
    suffix = match[2];
  if (suffix === "/exports" && request.method === "POST") {
    const input = await body();
    const encrypted =
      category === "models" && input.include_credentials === true;
    const content = encrypted
      ? {
          format: "wordweave-config-encrypted",
          version: 1,
          category,
          credential_mode: "encrypted",
          kdf: {},
          cipher: {},
          ciphertext: "synthetic",
        }
      : {
          format: "wordweave-config",
          version: 1,
          category,
          credential_mode: "none",
          data: category === "plans" ? { plans: [] } : {},
        };
    response.writeHead(200, {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="wordweave-${category}-20261016T020000Z${encrypted ? ".wwcfg" : ""}.json"`,
    });
    response.end(JSON.stringify(content));
    return true;
  }
  if (suffix === "/previews" && request.method === "POST") {
    await body();
    const blocked = importMode === "blocked";
    return json({
      category,
      schema_version: 1,
      can_commit: !blocked,
      operation_id: blocked ? null : operationId,
      preview_token: blocked ? null : "synthetic-preview-token",
      baseline_revision: "r1",
      created_at: createdAt,
      commit_not_after: blocked ? null : commitNotAfter,
      retain_until: blocked ? null : retainUntil,
      counts,
      changes:
        category === "models"
          ? changes
          : changes.map((item) => ({
              ...item,
              credential_action: item.kind === "connection" ? "none" : null,
            })),
      blockers: blocked
        ? [
            {
              code: "active_reference",
              source_category: "plans",
              source_kind: "plan",
              source_identity: "basic",
              source_label: "Basic plan",
              target: {
                kind: "model",
                identity: modelId,
                label: "Legacy model",
              },
              field: "/model_ids",
            },
          ]
        : [],
      effects,
      warnings: [
        { code: "effective_plan_may_change", item_ref: null, field: null },
      ],
      defaults_applied: [
        {
          code: "name_generated",
          item_ref: { kind: "connection", identity: connectionId },
          field: "/name",
        },
      ],
    });
  }
  if (suffix === "/imports" && request.method === "POST") {
    importCalls++;
    await body();
    if (importMode === "unknown")
      return problem(
        503,
        "outcome_unknown",
        { operation_id: operationId, outcome: "unknown" },
        { "retry-after": "2" },
      );
    if (importMode === "not_applied") return json(result("not_applied"));
    return json(result());
  }
  if (
    suffix === `/operations/${operationId}/resolve` &&
    request.method === "POST"
  ) {
    await body();
    return json(result());
  }
  if (suffix === "/current" && request.method === "GET") {
    return json({
      category,
      revision: "r2",
      read_at: "2026-10-16T23:56:00Z",
      configuration:
        category === "models"
          ? {
              connections: [
                {
                  id: connectionId,
                  protocol: "openai_chat",
                  base_url: "https://synthetic.invalid/v1",
                  name: "Synthetic connection",
                  models: [
                    {
                      id: modelId,
                      provider_model_id: "synthetic/model",
                      display_name: "Synthetic model",
                      description: null,
                      max_output_tokens: null,
                      output_mode: "prompt",
                      enabled: false,
                      custom_parameters: {},
                    },
                  ],
                },
              ],
            }
          : category === "plans"
            ? {
                plans: ["visitor", "basic", "pro", "plus"].map(
                  (code, index) => ({
                    code,
                    priority: index * 10,
                    rolling_24h_limit: index === 3 ? null : 0,
                    max_entries: 8,
                    allowed_lengths: [],
                    model_ids: [],
                    content_review_enabled: index > 1,
                    content_repair_limit: index > 1 ? 1 : 0,
                  }),
                ),
              }
            : category === "items"
              ? { items: [] }
              : {
                  mastery_experience: "0",
                  checkin: {
                    current: {
                      base_points: "0",
                      step_points: "0",
                      cap_points: "0",
                      normal_experience: "0",
                    },
                    pending: null,
                  },
                  levels: [
                    {
                      level_number: 1,
                      min_experience: "0",
                      reward_enabled: false,
                      reward: { points: "0", item_count: 0 },
                    },
                  ],
                  achievements: {
                    checkin_streak: [],
                    review_streak: [],
                    mastered_words: [],
                    saved_passages: [],
                  },
                },
    });
  }
  return false;
}
