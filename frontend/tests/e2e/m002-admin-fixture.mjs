const time = "2026-09-20T05:00:00Z";
let version = 1,
  baseVersion = 1,
  models,
  connections,
  groups,
  base = "basic",
  points = "40";
const grants = new Map();
const revision = () => `admin-revision-${version}`;
const quota = (remaining) => ({
  kind: "limited",
  limit: 10,
  remaining,
  window_hours: 24,
  refreshes_at: time,
});
function reset() {
  version = baseVersion = 1;
  base = "basic";
  points = "40";
  grants.clear();
  connections = [
    {
      id: "connection-admin",
      name: "Demo service",
      protocol: "openai_chat",
      base_url: "https://models.example/v1",
      credential_configured: true,
      masked_hint: "••••demo",
    },
  ];
  models = [
    {
      id: "model-admin",
      display_name: "Admin model",
      description: "Shared model",
      provider_model_id: "mock/admin-model",
      connection: connections[0],
      max_output_tokens: null,
      output_mode: "prompt",
      enabled: true,
      retired_at: null,
      assigned_group_codes: ["visitor", "basic", "pro", "plus"],
      created_at: time,
      updated_at: time,
    },
  ];
  groups = ["visitor", "basic", "pro", "plus"].map((code, i) => ({
    code,
    priority: i * 10,
    rolling_24h_limit: 10,
    max_entries: 8,
    allowed_lengths: ["short", "medium"],
    models: [{ id: "model-admin", display_name: "Admin model", enabled: true }],
  }));
}
reset();
const summary = (id) => ({
  id,
  username: id === "admin-target" ? "admin_target" : "learner_target",
  role: id === "admin-target" ? "admin" : "learner",
  plan_code: id === "admin-target" ? null : base,
  status: "active",
  created_at: time,
});
const user = (id) => ({
  ...summary(id),
  ui_locale: "en-US",
  nickname: id === "admin-target" ? null : "Learner",
  gender: null,
  last_login_at: time,
  last_learning_at: time,
  learning_batch_count: 1,
  generation_quota:
    id === "admin-target" ? null : { kind: "limited", remaining: 10 },
  growth:
    id === "admin-target"
      ? null
      : {
          level_number: 2,
          points,
          experience: "200",
          mastered_total: 30,
          saved_total: 6,
        },
  base_revision: id === "admin-target" ? null : "base-" + baseVersion,
  effective_plan_code: id === "admin-target" ? null : "pro",
});
const batch = {
  id: "admin-batch",
  title: "My edited story",
  title_revision: "title-1",
  saved_at: time,
  passage_preview: "Teams adapt.",
  tags: ["Growth"],
  entries: ["adapt"],
  model: { name: "Admin model" },
  meaning_language: "en",
  scenario: "story",
  length: "short",
  participates_in_range_review: true,
};
const detail = {
  id: batch.id,
  title: batch.title,
  title_revision: "title-1",
  title_max_length: 200,
  saved_at: time,
  configuration: {
    model: batch.model,
    meaning_language: "en",
    scenario: "story",
    length: "short",
  },
  participates_in_range_review: true,
  passage: "Teams adapt.",
  tags: ["Growth"],
  targets: [
    {
      entry: "adapt",
      entry_meaning: "change with a situation",
      hint_phrase: "adapt quickly",
      hint_blanks: [{ start: 0, end: 5 }],
      occurrences: [{ start: 6, end: 11, surface: "adapt" }],
    },
  ],
  review_summary: {
    completed_count: 0,
    successful_count: 0,
    last_completed_at: null,
  },
};
export async function adminFixture(request, response, url) {
  const json = (data, list = false, status = 200) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        data,
        meta: {
          request_id: "admin-fixture",
          ...(list ? { next_cursor: null, has_more: false } : {}),
        },
      }),
    );
    return true;
  };
  const problem = (status, code) => {
    response.writeHead(status, { "content-type": "application/problem+json" });
    response.end(
      JSON.stringify({
        type: "about:blank",
        title: "Request rejected",
        status,
        code,
        detail: "The request needs review.",
        request_id: "admin-fixture",
      }),
    );
    return true;
  };
  const body = async () => {
    let s = "";
    for await (const c of request) s += c;
    return s ? JSON.parse(s) : {};
  };
  if (url.pathname === "/api/v1/__test/admin-reset") {
    reset();
    return json({});
  }
  if (url.pathname === "/api/v1/__test/admin-conflict") {
    version++;
    return json({});
  }
  if (!url.pathname.startsWith("/api/v1/admin/")) return false;
  const path = url.pathname.slice("/api/v1/admin".length),
    method = request.method;
  if (path === "/model-connections") return json({ items: connections });
  if (path === "/model-connection-test") {
    const value = await body();
    if (value.connection?.api_key === "bad-key")
      return problem(422, "model_connection_auth");
    return json({ ok: true });
  }
  const providerView = (c) => ({
    connection: c,
    models: models.filter((m) => m.connection.id === c.id && !m.retired_at),
  });
  if (path === "/model-providers" && method === "GET")
    return json({ items: connections.map(providerView), revision: revision() });
  if (
    (path === "/model-providers" && method === "POST") ||
    (path.startsWith("/model-providers/") && method === "PATCH")
  ) {
    const value = await body(),
      id = method === "PATCH" ? path.split("/").at(-1) : null;
    if (value.expected_revision !== revision())
      return problem(409, "revision_conflict");
    const previous = id ? connections.find((c) => c.id === id) : null;
    if (id && !previous) return problem(404, "not_found");
    const draft = value.connection,
      original = id
        ? models.filter((m) => m.connection.id === id && !m.retired_at)
        : [];
    if (
      !value.models ||
      value.models.length > 1000 ||
      (!id && !value.models.length)
    )
      return problem(422, "validation_failed");
    const uids = value.models.filter((m) => m.id).map((m) => m.id);
    if (
      new Set(uids).size !== uids.length ||
      uids.length !== original.length ||
      original.some((m) => !uids.includes(m.id))
    )
      return problem(422, "validation_failed");
    if (
      !draft.api_key &&
      (!previous?.credential_configured ||
        previous.base_url !== draft.base_url ||
        previous.protocol !== draft.protocol)
    )
      return problem(422, "credential_missing");
    const ids = new Set(),
      names = new Set();
    for (const model of value.models) {
      const name = model.display_name?.trim() || model.provider_model_id;
      if (ids.has(model.provider_model_id) || names.has(name.toLowerCase()))
        return problem(409, "model_conflict");
      ids.add(model.provider_model_id);
      names.add(name.toLowerCase());
    }
    const connection = {
      id: id || "connection-" + (connections.length + 1),
      name: draft.name || new URL(draft.base_url).hostname,
      protocol: draft.protocol,
      base_url: draft.base_url,
      credential_configured: true,
      masked_hint: draft.api_key ? "••••test" : previous.masked_hint,
    };
    const items = value.models.map((m, index) => ({
      ...original.find((p) => p.id === m.id),
      id: m.id || "model-new-" + (models.length + index),
      display_name: m.display_name?.trim() || m.provider_model_id,
      description: m.description ?? null,
      provider_model_id: m.provider_model_id,
      connection,
      max_output_tokens: m.max_output_tokens ?? null,
      output_mode: m.output_mode,
      enabled: m.enabled,
      retired_at: null,
      assigned_group_codes:
        original.find((p) => p.id === m.id)?.assigned_group_codes ?? [],
      created_at: original.find((p) => p.id === m.id)?.created_at ?? time,
      updated_at: time,
    }));
    if (previous) connections[connections.indexOf(previous)] = connection;
    else connections.push(connection);
    models = models
      .filter((m) => m.connection.id !== connection.id || m.retired_at)
      .concat(items);
    version++;
    return json(
      { provider: { connection, models: items }, revision: revision() },
      false,
      id ? 200 : 201,
    );
  }
  const resolveConnection = (value) => {
    if (!value.connection)
      return connections.find((c) => c.id === value.connection_id);
    const d = value.connection;
    const c = {
      id: "connection-" + (connections.length + 1),
      name: d.name || new URL(d.base_url).hostname,
      protocol: d.protocol,
      base_url: d.base_url,
      credential_configured: true,
      masked_hint: "••••test",
    };
    connections.push(c);
    return c;
  };
  if (path === "/models" && method === "GET")
    return json({ items: models, revision: revision() }, true);
  if (path === "/models/batch" && method === "POST") {
    const value = await body();
    if (value.expected_revision !== revision())
      return problem(409, "revision_conflict");
    if (!value.models?.length || value.models.length > 100)
      return problem(422, "validation_failed");
    const seen = new Set();
    for (const item of value.models) {
      if (!item.provider_model_id || seen.has(item.provider_model_id))
        return problem(409, "model_conflict");
      seen.add(item.provider_model_id);
      if (
        !value.connection &&
        models.some(
          (m) =>
            !m.retired_at &&
            m.connection.id === value.connection_id &&
            m.provider_model_id === item.provider_model_id,
        )
      )
        return problem(409, "model_conflict");
    }
    const connection = resolveConnection(value);
    if (!connection) return problem(422, "validation_failed");
    const items = value.models.map((item, index) => ({
      id: "model-new-" + (models.length + index),
      display_name: item.display_name?.trim() || item.provider_model_id,
      description: item.description ?? null,
      provider_model_id: item.provider_model_id,
      connection,
      max_output_tokens: item.max_output_tokens ?? null,
      output_mode: item.output_mode,
      enabled: item.enabled,
      retired_at: null,
      assigned_group_codes: [],
      created_at: time,
      updated_at: time,
    }));
    models.push(...items);
    version++;
    return json({ items, revision: revision() }, false, 201);
  }
  if (path === "/models" && method === "POST") {
    const value = await body();
    if (value.expected_revision !== revision())
      return problem(409, "revision_conflict");
    version++;
    const model = {
      id: "model-new-" + models.length,
      display_name: value.display_name,
      description: value.description ?? null,
      provider_model_id: value.provider_model_id,
      connection: resolveConnection(value),
      max_output_tokens: value.max_output_tokens ?? null,
      output_mode: value.output_mode,
      enabled: value.enabled,
      retired_at: null,
      assigned_group_codes: [],
      created_at: time,
      updated_at: time,
    };
    models.push(model);
    return json({ model, revision: revision() }, false, 201);
  }
  const modelMatch = path.match(/^\/models\/([^/]+)(?:\/(.+))?$/);
  if (modelMatch) {
    const model = models.find((m) => m.id === modelMatch[1]);
    if (!model) return problem(404, "not_found");
    if (modelMatch[2] === "removal-impact")
      return json({
        model,
        affected_groups: model.assigned_group_codes.map((code) => ({
          code,
          remaining_enabled_models: 0,
        })),
        affected_presets: 2,
        affected_item_definitions: 3,
        affected_owned_cards: 4,
        confirmation_token: "remove-private",
        revision: revision(),
      });
    const value = await body();
    if (value.expected_revision !== revision())
      return problem(409, "revision_conflict");
    version++;
    if (method === "PATCH") {
      model.connection = resolveConnection(value);
      model.max_output_tokens = value.max_output_tokens;
      model.output_mode = value.output_mode;
      if (value.display_name !== undefined)
        model.display_name = value.display_name;
      if (value.description !== undefined)
        model.description = value.description;
      if (
        value.provider_model_id !== undefined &&
        value.provider_model_id !== model.provider_model_id
      ) {
        model.provider_model_id = value.provider_model_id;
        model.enabled = false;
      }
      model.enabled = value.enabled;
    } else if (method === "DELETE") {
      if (value.confirmation_token !== "remove-private" || !value.confirmed)
        return problem(422, "validation_failed");
      const affected = [...model.assigned_group_codes];
      model.retired_at = time;
      model.enabled = false;
      model.assigned_group_codes = [];
      groups.forEach(
        (g) => (g.models = g.models.filter((m) => m.id !== model.id)),
      );
      return json({ model, affected_groups: affected, revision: revision() });
    } else model.enabled = modelMatch[2] === "enable";
    return json({ model, revision: revision() });
  }
  if (path === "/groups" && method === "GET")
    return json({ items: groups, revision: revision() });
  if (path === "/groups/priority-impact" || path === "/groups/priorities") {
    const value = await body();
    if (value.expected_revision !== revision())
      return problem(409, "revision_conflict");
    if (new Set(value.priorities.map((p) => p.priority)).size !== 4)
      return problem(422, "duplicate_priority");
    if (method === "POST")
      return json({
        affected_base_users: 2,
        affected_trial_users: 1,
        revision: revision(),
      });
    version++;
    for (const priority of value.priorities)
      groups.find((g) => g.code === priority.code).priority = priority.priority;
    return json({ items: groups, revision: revision() });
  }
  const groupMatch = path.match(
    /^\/groups\/(visitor|basic|pro|plus)(\/impact-preview)?$/,
  );
  if (groupMatch) {
    const value = await body();
    if (value.expected_revision !== revision())
      return problem(409, "revision_conflict");
    if (method === "POST")
      return json({
        base_users: 2,
        active_trial_users: 1,
        priority_changed: true,
        may_change_effective_plan: true,
        loses_all_models: !value.model_ids.length,
        revision: revision(),
      });
    const group = groups.find((g) => g.code === groupMatch[1]);
    Object.assign(group, {
      priority: value.priority,
      rolling_24h_limit: value.rolling_24h_limit,
      max_entries: value.max_entries,
      allowed_lengths: value.allowed_lengths,
      models: value.model_ids.map((id) => {
        const m = models.find((m) => m.id === id);
        return { id, display_name: m.display_name, enabled: m.enabled };
      }),
    });
    version++;
    return json({ group, revision: revision() });
  }
  if (path === "/users") {
    const query = (url.searchParams.get("username") ?? "").toLowerCase();
    return json(
      {
        items: ["admin-target", "learner-target"]
          .map(summary)
          .filter((u) => u.username.includes(query)),
      },
      true,
    );
  }
  const target = path.match(/^\/users\/([^/]+)(?:\/(.+))?$/);
  if (!target) return false;
  const id = target[1],
    action = target[2];
  if (!action) return json({ user: user(id) });
  if (action === "benefits")
    return json({
      base_plan: { code: base, quota: quota(10) },
      trial: { code: "pro", ends_at: "2026-09-26T05:00:00Z", quota: quota(2) },
      effective_origin: "trial",
      extra_quota: { remaining: 3, earliest_expires_at: time },
    });
  if (action === "group") {
    const value = await body();
    if (value.expected_base_revision !== "base-" + baseVersion)
      return problem(409, "base_plan_changed");
    base = value.group_code;
    baseVersion++;
    return json({ user: user(id), quota_reset: true });
  }
  if (action === "password") {
    await body();
    response.writeHead(204);
    response.end();
    return true;
  }
  if (action === "batches") return json({ items: [batch] }, true);
  if (action === "batches/admin-batch") return json({ batch: detail });
  if (action === "points-ledger")
    return json(
      {
        balance: points,
        items: [...grants.values()].map((r) => ({
          id: r.id,
          settlement_id: r.id,
          kind: "admin_grant",
          delta: r.points_delta,
          balance_after: r.points_after,
          created_at: r.settled_at,
          admin_username: "admin_e2e",
        })),
      },
      true,
    );
  if (action === "point-grants") {
    const value = await body(),
      key = request.headers["idempotency-key"];
    if (grants.has(key)) return json({ receipt: grants.get(key) });
    points = String(BigInt(points) + BigInt(value.points));
    const receipt = {
      id: "grant-" + grants.size,
      kind: "admin_grant",
      settled_at: time,
      points_delta: value.points,
      experience_delta: "0",
      points_after: points,
      experience_after: "200",
      items: [],
    };
    grants.set(key, receipt);
    return json({ receipt });
  }
  return false;
}
