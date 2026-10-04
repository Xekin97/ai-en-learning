const time = "2026-09-20T05:00:00Z",
  day = "2026-09-20";
let revision = 1,
  settings,
  levels,
  achievements,
  items,
  failRow = false;
const reward = () => ({ points: "0", item_definition_id: null, item_count: 0 });
const kinds = [
  "checkin_streak",
  "review_streak",
  "mastered_words",
  "saved_passages",
];
function reset() {
  revision = 1;
  failRow = false;
  settings = {
    learning_day: day,
    mastery_experience: "1",
    growth_started_at: time,
    current: {
      effective_day: day,
      base_points: "2",
      step_points: "1",
      cap_points: "8",
      normal_experience: "1",
    },
    pending: null,
  };
  levels = [0, 100, 200, 300].map((value, i) => ({
    id: "level-" + (i + 1),
    level_number: i + 1,
    min_experience: String(value),
    reward_enabled: i > 0,
    reward: reward(),
  }));
  achievements = Object.fromEntries(
    kinds.map((kind) => [
      kind,
      [
        {
          id: "tier-" + kind,
          kind,
          threshold: 7,
          enabled: true,
          name: { zh_CN: null, en_US: "Achievement" },
          title: { zh_CN: null, en_US: "Title" },
          description: { zh_CN: null, en_US: "Original description" },
          reward: { ...reward(), experience: "10" },
        },
      ],
    ]),
  );
  items = [
    {
      id: "definition-used",
      kind: "makeup",
      name: { zh_CN: null, en_US: "Issued make-up card" },
      description: { zh_CN: null, en_US: "Historical card" },
      exchange_price: "10",
      activation_ttl_seconds: 86400,
      effect: { kind: "makeup" },
      listed: false,
      ever_issued: true,
      reference_count: 0,
      created_at: time,
      updated_at: time,
    },
  ];
}
reset();
export async function adminGrowthFixture(request, response, url) {
  const json = (data, list = false, status = 200) => {
    response.writeHead(status, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        data,
        meta: {
          request_id: "growth-admin-fixture",
          ...(list ? { next_cursor: null, has_more: false } : {}),
        },
      }),
    );
    return true;
  };
  const problem = (status, code, fields) => {
    response.writeHead(status, { "content-type": "application/problem+json" });
    response.end(
      JSON.stringify({
        type: "about:blank",
        title: "Review changes",
        status,
        code,
        detail: "Please review the fields.",
        request_id: "growth-admin-fixture",
        ...(fields ? { field_errors: fields } : {}),
      }),
    );
    return true;
  };
  const body = async () => {
    let s = "";
    for await (const c of request) s += c;
    return s ? JSON.parse(s) : {};
  };
  const rev = () => `growth-config-${revision}`;
  if (url.pathname === "/api/v1/__test/admin-growth-reset") {
    reset();
    return json({});
  }
  if (url.pathname === "/api/v1/__test/admin-growth-row-error") {
    failRow = true;
    return json({});
  }
  if (!url.pathname.startsWith("/api/v1/admin/growth/")) return false;
  const path = url.pathname.slice("/api/v1/admin/growth".length),
    method = request.method;
  if (path === "/settings") {
    if (method === "PUT") {
      const input = await body();
      if (input.expected_revision !== rev())
        return problem(409, "revision_conflict");
      settings.mastery_experience = input.mastery_experience;
      settings.pending = {
        effective_day: "2026-09-21",
        base_points: input.base_points,
        step_points: input.step_points,
        cap_points: input.cap_points,
        normal_experience: input.normal_experience,
      };
      revision++;
    }
    return json({ ...settings, revision: rev() });
  }
  if (path === "/levels" && method === "GET")
    return json({ items: levels, revision: rev() });
  if (path === "/levels/impact-preview") {
    const input = await body();
    if (input.expected_revision !== rev())
      return problem(409, "revision_conflict");
    return json({
      may_downgrade: true,
      affected_users: 2,
      rewards_use_latest_config: true,
      confirmation_token: "levels-preview-private",
      expires_at: "2026-09-20T05:05:00Z",
      revision: rev(),
    });
  }
  if (path === "/levels" && method === "PUT") {
    const input = await body();
    if (input.expected_revision !== rev())
      return problem(409, "revision_conflict");
    if (
      input.confirmation_token !== "levels-preview-private" ||
      !input.confirmed
    )
      return problem(422, "validation_failed");
    const saved_rows = [];
    for (const change of input.changes) {
      const row = {
        id: change.id ?? "level-" + change.value.level_number,
        ...change.value,
      };
      const index = levels.findIndex((l) => l.id === row.id);
      if (index < 0) levels.push(row);
      else levels[index] = row;
      saved_rows.push({ client_key: change.client_key, id: row.id });
    }
    levels.sort((a, b) => a.level_number - b.level_number);
    revision++;
    return json({
      configuration: { items: levels, revision: rev() },
      saved_rows,
    });
  }
  if (path === "/achievements" && method === "GET") {
    const kind = url.searchParams.get("kind");
    return json({ kind, items: achievements[kind], revision: rev() });
  }
  if (path === "/achievements" && method === "PUT") {
    const input = await body();
    if (input.expected_revision !== rev())
      return problem(409, "revision_conflict");
    if (failRow) {
      failRow = false;
      return problem(422, "validation_failed", [
        { field: "/changes/0/value/threshold", code: "duplicate_threshold" },
      ]);
    }
    const saved_rows = [];
    for (const change of input.changes) {
      const row = {
        id: change.id ?? "tier-" + input.kind + "-" + change.value.threshold,
        kind: input.kind,
        ...change.value,
      };
      const rows = achievements[input.kind],
        index = rows.findIndex((r) => r.id === row.id);
      if (index < 0) rows.push(row);
      else rows[index] = row;
      saved_rows.push({ client_key: change.client_key, id: row.id });
    }
    revision++;
    return json({
      configuration: {
        kind: input.kind,
        items: achievements[input.kind],
        revision: rev(),
      },
      saved_rows,
    });
  }
  if (path === "/items" && method === "GET")
    return json({ items, revision: rev() }, true);
  const item = path.match(/^\/items(?:\/([^/]+))?(?:\/(listing|references))?$/);
  if (item) {
    const existing = items.find((i) => i.id === item[1]);
    if (item[2] === "references")
      return json({ ever_issued: existing.ever_issued, items: [] }, true);
    if (method === "GET") return json({ item: existing, revision: rev() });
    const input = await body();
    if (existing && input.expected_revision !== rev())
      return problem(409, "revision_conflict");
    if (method === "DELETE") {
      if (existing.ever_issued) return problem(409, "item_has_history");
      items = items.filter((i) => i !== existing);
      revision++;
      response.writeHead(204);
      response.end();
      return true;
    }
    if (item[2] === "listing") {
      existing.listed = input.listed;
      revision++;
      return json({ item: existing, revision: rev() });
    }
    delete input.expected_revision;
    const value = {
      id: existing?.id ?? "definition-new",
      ...input,
      listed: existing?.listed ?? false,
      ever_issued: existing?.ever_issued ?? false,
      reference_count: existing?.reference_count ?? 0,
      created_at: existing?.created_at ?? time,
      updated_at: time,
    };
    if (existing) items[items.indexOf(existing)] = value;
    else items.push(value);
    revision++;
    return json({ item: value, revision: rev() }, false, existing ? 200 : 201);
  }
  return false;
}
